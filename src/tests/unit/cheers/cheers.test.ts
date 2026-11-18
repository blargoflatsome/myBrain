// SPEC §5 Cheers: "2 h ago", suggested I did it! lines from what I did, and when the quiet offer comes.
import { describe, expect, it } from 'vitest'
import { agoLabel, offerFor, OFFER_GAP_MS } from '@/cheers/rules'
import { momentOf } from '@/stores/cheers'
import { messages } from '@/messages'
import type { TaskRow } from '@/sync/types'

const m = messages.cheers
const TZ = 'America/New_York'
const NOW = new Date('2026-11-17T17:00:00Z') // Tue Nov 17, noon in New York
const task = (extra: Partial<TaskRow>): TaskRow => ({ id: 't', title: 'Call the bank about the loan', due_date: '2026-11-17', status: 'done', source: 'manual', deleted_at: null, ...extra })

describe('SPEC §5 Cheers: when a post was made', () => {
  it.each([
    ['2026-11-17T16:59:40Z', m.ago.now],
    ['2026-11-17T16:48:00Z', m.ago.minutes(12)],
    ['2026-11-17T14:30:00Z', m.ago.hours(2)],
  ])('%s reads %s', (iso, label) => expect(agoLabel(iso, NOW)).toBe(label))
})

describe('SPEC §5 Cheers: I did it! is offered at natural moments, never with private titles', () => {
  it('an old task suggests its age, not its title', () => {
    const moment = momentOf({ kind: 'task', task: task({ due_date: '2026-11-13' }) }, NOW, TZ)
    expect(moment).toEqual({ kind: 'old_task', days: 4 })
    expect(offerFor(moment!, false, 0, NOW.getTime())).toEqual({ kind: 'did_it', line: m.suggest.oldTask(4) })
  })
  it('an ugh quest, a finished routine and a trophy are moments; a step or an everyday task is not', () => {
    expect(offerFor(momentOf({ kind: 'quest', energy: 'ugh' }, NOW, TZ)!, false, 0, NOW.getTime())).toEqual({ kind: 'did_it', line: m.suggest.ughQuest })
    expect(momentOf({ kind: 'step', finished: true }, NOW, TZ)).toEqual({ kind: 'routine' })
    expect(momentOf({ kind: 'step', finished: false }, NOW, TZ)).toBeNull()
    expect(offerFor(momentOf({ kind: 'task', task: task({}) }, NOW, TZ)!, false, 0, NOW.getTime())).toBeNull()
  })
  it('comes at most once every 2 hours, so it never nags', () => {
    expect(offerFor({ kind: 'routine' }, false, NOW.getTime() - OFFER_GAP_MS + 60_000, NOW.getTime())).toBeNull()
    expect(offerFor({ kind: 'routine' }, false, NOW.getTime() - OFFER_GAP_MS, NOW.getTime())).not.toBeNull()
  })
  it('on a day I posted I\'m stuck, finishing anything (even an everyday task) offers I got unstuck!', () => {
    const moment = momentOf({ kind: 'habit', habit: { id: 'h', title: 'Meds', notify_time: null, timer_minutes: null, weekdays: [], start_date: '2026-11-01', deleted_at: null } }, NOW, TZ)
    expect(offerFor(moment!, true, NOW.getTime(), NOW.getTime())).toEqual({ kind: 'unstuck' })
  })
})
