// SPEC §5 Dashboard Up next: the words for a suggestion, its title and the short line under it. Shared by the
// Dashboard's card and the TV's night screen (SPEC §9), so both say the same thing.
import { KEEP_GOING_DAYS, type Suggestion } from '@/dashboard/upNext'
import { clockIn } from '@/time/days'
import { timeLabel } from '@/ui/dates'
import { messages } from '@/messages'

const u = messages.dashboard.upNext

/** A suggestion's title; with none left, "Past you cleared the decks." */
export function suggestionTitle(s: Suggestion | null): string {
  if (!s) return u.doneTitle
  if (s.kind === 'orphans') return u.orphansTitle(s.count)
  if (s.kind === 'journal') return u.journalTitle
  return s.title
}

/** The short line under a suggestion's title (why it's up next); empty with none left. */
export function suggestionReason(s: Suggestion | null, timeZone: string): string {
  if (!s) return ''
  const clock = (ms: number) => timeLabel(clockIn(ms, timeZone))
  switch (s.kind) {
    case 'priority_habit':
    case 'priority_task':
      return u.priority
    case 'habit':
      return s.streak >= KEEP_GOING_DAYS ? u.keepGoing(s.streak, clock(s.by)) : u.dueBy(clock(s.by))
    case 'routine':
      return s.started ? u.routineStarted : u.routine
    case 'event':
      return u.event(timeLabel(s.time))
    case 'stuck_task':
      return u.stuck(s.times)
    case 'task':
      return u.task
    case 'orphans':
      return u.orphans
    case 'journal':
      return u.journal
  }
}
