// SPEC §9 TV app, Remote control: the TV remote's buttons as the page sees them. Tizen sends its Back button as key
// code 10009 (XF86Back); a computer's Escape and Backspace stand in for it, so the page can be tried with a keyboard.

export type RemoteButton = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'other'

const BY_KEY: Record<string, RemoteButton> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  Escape: 'back',
  Backspace: 'back',
  XF86Back: 'back',
}
const BY_CODE: Record<number, RemoteButton> = { 38: 'up', 40: 'down', 37: 'left', 39: 'right', 13: 'ok', 10009: 'back', 27: 'back', 8: 'back' }

/** Which remote button a key press is. */
export function buttonOf(e: { key?: string; keyCode?: number }): RemoteButton {
  return (e.key && BY_KEY[e.key]) || (e.keyCode !== undefined && BY_CODE[e.keyCode]) || 'other'
}
