// SPEC §9 TV app, Focus timer: keep the TV screen awake while the timer shows. Inside the TV's launcher the page may
// reach Samsung's own calls (the screen saver, the power manager); in any other browser it uses the Screen Wake Lock
// where there is one. Each is tried only when present, and a refusal just lets the TV dim as usual.

interface TvGlobals {
  tizen?: { power?: { request(resource: 'SCREEN', state: 'SCREEN_NORMAL'): void; release(resource: 'SCREEN'): void } }
  webapis?: { appcommon?: { setScreenSaver(state: number): void; AppCommonScreenSaverState?: { SCREEN_SAVER_OFF: number; SCREEN_SAVER_ON: number } } }
}

/** Turn the TV's screen saver and screen dimming off (true) or back on (false). */
export function keepTvAwake(on: boolean, g: TvGlobals = window as unknown as TvGlobals) {
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
