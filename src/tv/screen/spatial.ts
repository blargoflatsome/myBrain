// SPEC §9 TV app, Remote control: the remote has arrows, not Tab, so an arrow moves focus to the nearest control in
// that direction. Pure maths on the controls' boxes, so it's tested without a browser.
import type { RemoteButton } from '@/tv/screen/remote'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

type Arrow = Extract<RemoteButton, 'up' | 'down' | 'left' | 'right'>

/**
 * Which of `boxes` an arrow moves to from `from`: the nearest one whose centre lies that way, with sideways distance
 * counting double so a control straight ahead wins over a closer one off to the side. -1 when there's none.
 */
export function nextFocus(from: Box, boxes: Box[], arrow: Arrow): number {
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2
  let best = -1
  let bestScore = Infinity
  boxes.forEach((b, i) => {
    const dx = b.left + b.width / 2 - cx
    const dy = b.top + b.height / 2 - cy
    const ahead = arrow === 'left' ? -dx : arrow === 'right' ? dx : arrow === 'up' ? -dy : dy
    const side = arrow === 'left' || arrow === 'right' ? Math.abs(dy) : Math.abs(dx)
    if (ahead <= 0.5) return
    const score = ahead + side * 2
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}
