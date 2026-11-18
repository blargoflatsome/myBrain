// SPEC §5 Focus timer, the quiet room: the server calls. Only anonymous dots ever come back.
import { supabase } from '@/lib/supabase'
import type { FocusPhase } from '@/focus/timer'

/** At most this many dots come back, however many are focusing (SPEC §5 Focus timer: kept small and calm). */
export const MAX_DOTS = 40

/** Someone else focusing now: a short id that changes every session, and when their part ends (ms). */
export interface RoomDot {
  id: string
  endsAt: number
}

export interface Room {
  dots: RoomDot[]
  /** This check-in counts for Focused together: I'm shown and someone else is there. */
  together: boolean
}

interface Answer {
  /** s: seconds until that person's part ends (kept short so a check-in stays small). */
  dots: { id: string; s: number }[]
  together: boolean
}

/** Check in with my current part and see the room. */
export async function checkIn(part: { phase: FocusPhase; endsAt: number }): Promise<Room> {
  const args = { p_phase: part.phase, p_ends_at: new Date(part.endsAt).toISOString() }
  const { data, error } = await supabase.rpc('focus_room', args)
  const now = Date.now()
  if (error) throw new Error(error.message)
  const a = (data ?? {}) as Partial<Answer>
  return {
    dots: (a.dots ?? []).slice(0, MAX_DOTS).map((d) => ({ id: d.id, endsAt: now + d.s * 1000 })),
    together: !!a.together,
  }
}

/** Leave the room (the timer stopped). */
export async function leave(): Promise<void> {
  await supabase.rpc('focus_leave')
}

/** Where a dot sits, as percentages of the screen: from its id, on a ring around the time so it never covers it. */
export function dotPlace(id: string): { x: number; y: number } {
  let h = 2166136261
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const angle = ((h >>> 0) % 360) * (Math.PI / 180)
  const reach = 0.7 + (((h >>> 9) % 100) / 100) * 0.25
  return { x: 50 + Math.cos(angle) * reach * 46, y: 50 + Math.sin(angle) * reach * 44 }
}

/** A dot glows softly for a few seconds after that person finishes a part. */
export const GLOW_MS = 4000
export function glowing(dot: RoomDot, now: number): boolean {
  return now >= dot.endsAt && now - dot.endsAt < GLOW_MS
}
