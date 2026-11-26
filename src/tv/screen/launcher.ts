// SPEC §9 TV app, The launcher: on the TV the page runs in a frame inside the launcher (tv-launcher/). Once the page
// says it's ready, the launcher stops retrying and keeps the TV awake while it shows; it checks the message comes from
// the My Brain site and its own frame. In any other browser there is no launcher and nothing is sent.

/** What the page can tell the launcher. tv-launcher/launcher.js reads the same shape. */
export type LauncherMessage = { myBrainTv: 'ready' }

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
