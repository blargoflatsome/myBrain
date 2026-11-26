// SPEC §9 TV app, The launcher: on the TV the page runs in a frame inside the launcher (tv-launcher/), whose own page
// alone may use Samsung's TV calls. The page asks it for them with a message; the launcher checks that it comes from
// the My Brain site and its own frame. In any other browser there is no launcher and nothing is sent.

/** What the page can tell the launcher. tv-launcher/launcher.js reads the same shapes. */
export type LauncherMessage = { myBrainTv: 'ready' } | { myBrainTv: 'keep-awake'; on: boolean }

export interface Framed {
  parent?: { postMessage(message: unknown, targetOrigin: string): void } | null
}

/** Whether the page is inside the launcher's frame. */
export function inLauncher(g: Framed = window as unknown as Framed) {
  return !!g.parent && g.parent !== (g as unknown)
}

/** Send the launcher a message, when there is one. */
export function tellLauncher(message: LauncherMessage, g: Framed = window as unknown as Framed) {
  if (!inLauncher(g)) return
  try {
    // The launcher is a local app file, whose origin can't be named here; the message holds nothing private.
    g.parent!.postMessage(message, '*')
  } catch {
    // No launcher listening: nothing to do.
  }
}
