// SPEC §9 TV app, Focus timer: keep the TV screen awake while the timer shows. On the TV the page is framed by the
// launcher, which alone can use Samsung's calls (the screen saver, the power manager), so the page asks it and the
// launcher makes the same calls (tv-launcher/launcher.js). In any other browser the page uses
// the Screen Wake Lock where there is one. Each call is tried only when present; a refusal just lets the TV dim.
import { tellLauncher, type Framed } from '@/tv/screen/launcher'

interface TvGlobals extends Framed {
  tizen?: { power?: { request(resource: 'SCREEN', state: 'SCREEN_NORMAL'): void; release(resource: 'SCREEN'): void } }
  webapis?: { appcommon?: { setScreenSaver(state: number): void; AppCommonScreenSaverState?: { SCREEN_SAVER_OFF: number; SCREEN_SAVER_ON: number } } }
}

/** Turn the TV's screen saver and screen dimming off (true) or back on (false). */
export function keepTvAwake(on: boolean, g: TvGlobals = window as unknown as TvGlobals) {
  tellLauncher({ myBrainTv: 'keep-awake', on }, g)
  try {
    const states = g.webapis?.appcommon?.AppCommonScreenSaverState
    if (states) g.webapis!.appcommon!.setScreenSaver(on ? states.SCREEN_SAVER_OFF : states.SCREEN_SAVER_ON)
  } catch {
    // Not allowed here: the TV dims as usual.
  }
  try {
    if (on) g.tizen?.power?.request('SCREEN', 'SCREEN_NORMAL')
    else g.tizen?.power?.release('SCREEN')
  } catch {
    // Not allowed here: the TV dims as usual.
  }
}
