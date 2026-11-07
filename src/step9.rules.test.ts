import { describe, expect, it } from 'vitest'
import type { EventRow, ItemTagRow, TagRow, VaultBucketRow, VaultItemRow } from '@/sync/types'
import { checkedItems, clampRating, itemsInBucket, linkLabel, linkTarget } from '@/vault/rules'
import { calendarItems, eventProblem, newEvent, occurrences, occursOn } from '@/events/rules'
import { cleanTagName, itemTagIdFor, tagChanges, tagIdFor, tagsOf } from '@/tags/rules'
import { fold, search, searchDocs, snippet } from '@/search/search'

const UID = '11111111-2222-4333-8444-555555555555'

describe('Spec §5 The Vault', () => {
  const list: VaultBucketRow = { id: 'b1', name: 'Shopping list', position: 0, checkable: true, deleted_at: null }
  const reviews: VaultBucketRow = { id: 'b2', name: 'Restaurant reviews', position: 1, checkable: false, deleted_at: null }
  const item = (id: string, extra: Partial<VaultItemRow> = {}): VaultItemRow => ({ id, bucket_id: 'b1', title: id, created_at: `2026-11-0${id.slice(-1)}`, deleted_at: null, ...extra })

  it('items are shown in the order added; in a checklist bucket checked items go to the bottom', () => {
    const items = [item('i3'), item('i1', { checked: true }), item('i2'), item('i4', { deleted_at: 'x' }), item('i5', { bucket_id: 'b2' })]
    expect(itemsInBucket(items, list).map((i) => i.id)).toEqual(['i2', 'i3', 'i1'])
    expect(checkedItems(items, list).map((i) => i.id)).toEqual(['i1'])
    expect(checkedItems(items, reviews)).toEqual([])
  })

  it('a web address opens as is; anything else opens in maps', () => {
    expect(linkTarget('https://example.com/menu')).toEqual({ href: 'https://example.com/menu', kind: 'web' })
    expect(linkTarget('example.com')).toEqual({ href: 'https://example.com', kind: 'web' })
    expect(linkTarget('12 High St, Springfield')).toEqual({
      href: 'https://www.google.com/maps/search/?api=1&query=12%20High%20St%2C%20Springfield',
      kind: 'map',
    })
    expect(linkLabel('https://www.example.com/menu')).toBe('example.com')
    expect(linkLabel('12 High St')).toBe('12 High St')
  })

  it('star ratings are 1 to 5, or none', () => {
    expect(clampRating(0)).toBeNull()
    expect(clampRating(7)).toBe(5)
    expect(clampRating(3)).toBe(3)
  })
})

describe('Spec §5 Calendar: events repeat', () => {
  const e = (repeat: EventRow['repeat'], start = '2026-11-10'): EventRow => ({ ...newEvent(UID, start, '15:00', 'e1'), title: 'x', repeat })

  it('never, daily, weekdays, weekly, monthly and yearly', () => {
    expect(occursOn(e('never'), '2026-11-10')).toBe(true)
    expect(occursOn(e('never'), '2026-11-11')).toBe(false)
    expect(occursOn(e('daily'), '2026-11-09')).toBe(false)
    expect(occursOn(e('daily'), '2026-12-25')).toBe(true)
    expect(occursOn(e('weekdays'), '2026-11-13')).toBe(true)
    expect(occursOn(e('weekdays'), '2026-11-14')).toBe(false)
    expect(occursOn(e('weekly'), '2026-11-17')).toBe(true)
    expect(occursOn(e('weekly'), '2026-11-18')).toBe(false)
    expect(occursOn(e('monthly', '2026-01-31'), '2026-03-31')).toBe(true)
    expect(occursOn(e('monthly', '2026-01-31'), '2026-02-28')).toBe(false)
    expect(occursOn(e('yearly', '2020-11-11'), '2026-11-11')).toBe(true)
  })

  it('a multi-day event that began before the range still shows', () => {
    const trip: EventRow = { ...newEvent(UID, '2026-11-08', null, 'e2'), title: 'Trip', end_date: '2026-11-12' }
    expect(occurrences(trip, '2026-11-10', '2026-11-16')).toEqual(['2026-11-08'])
  })

  it('a new event lasts an hour from the chosen time, or is all day when a day is chosen', () => {
    expect(newEvent(UID, '2026-11-10', '15:30', 'x')).toMatchObject({ start_time: '15:30', end_time: '16:30', end_date: '2026-11-10' })
    expect(newEvent(UID, '2026-11-10', null, 'x')).toMatchObject({ start_time: null, end_time: null })
    expect(newEvent(UID, '2026-11-10', '23:30', 'x')).toMatchObject({ end_time: '23:59' })
  })

  it('an event needs a title and must not end before it starts', () => {
    expect(eventProblem({ ...newEvent(UID, '2026-11-10', '15:00', 'x'), title: ' ' })).toBe('title')
    expect(eventProblem({ ...newEvent(UID, '2026-11-10', '15:00', 'x'), title: 'a', end_time: '14:00' })).toBe('end')
    expect(eventProblem({ ...newEvent(UID, '2026-11-10', '15:00', 'x'), title: 'a' })).toBeNull()
  })

  it('the calendar shows dated tasks (priority colour), priority tasks at their time, and events', () => {
    const items = calendarItems(
      {
        tasks: [
          { id: 't1', title: 'Pay rent', due_date: '2026-11-10', priority: 3, status: 'open', source: 'manual', deleted_at: null },
          { id: 't2', title: 'Undated', due_date: null, status: 'open', source: 'manual', deleted_at: null },
          { id: 't3', title: 'Cancelled', due_date: '2026-11-10', status: 'cancelled', source: 'manual', deleted_at: null },
        ],
        priorityTasks: [{ id: 'p1', title: 'Insulin', reminder_time: '12:00:00', due_date: null, weekdays: [2], start_date: '2026-11-01', deleted_at: null }],
        events: [{ ...e('weekly'), title: 'Standup' }],
      },
      '2026-11-09',
      '2026-11-15',
    )
    expect(items.map((i) => [i.title, i.start, i.allDay])).toEqual([
      ['‼ Pay rent', '2026-11-10', true],
      ['⚠ Insulin', '2026-11-10T12:00', false],
      ['Standup', '2026-11-10T15:00', false],
    ])
    expect(items[0]!.className).toContain('cal-high')
  })
})

describe('Spec §5 Tags', () => {
  it('tag names are tidied, and the same name gives the same tag on every device (ignoring case)', () => {
    expect(cleanTagName('  road   trip ')).toBe('road trip')
    expect(tagIdFor(UID, 'Work')).toBe(tagIdFor(UID, 'work '))
    expect(tagIdFor(UID, 'Work')).not.toBe(tagIdFor(UID, 'home'))
    expect(tagIdFor(UID, 'Work')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(tagIdFor(UID, 'Work')).not.toBe(tagIdFor('99999999-2222-4333-8444-555555555555', 'Work'))
  })

  it('saving tag names creates new tags, adds missing links and removes dropped ones', () => {
    const work: TagRow = { id: tagIdFor(UID, 'work'), name: 'work', deleted_at: null }
    const old: TagRow = { id: tagIdFor(UID, 'old'), name: 'old', deleted_at: null }
    const link = (tag: TagRow): ItemTagRow => ({ id: itemTagIdFor('item-0000-0000-0000-000000000001', tag.id), tag_id: tag.id, item_type: 'task', item_id: 'item-0000-0000-0000-000000000001', deleted_at: null })
    const changes = tagChanges(UID, 'task', 'item-0000-0000-0000-000000000001', ['Work', 'Errands', ''], [work, old], [link(old)])
    expect(changes.newTags.map((t) => t.name)).toEqual(['Errands'])
    expect(changes.add.map((a) => a.tag_id).sort()).toEqual([work.id, tagIdFor(UID, 'Errands')].sort())
    expect(changes.remove.map((r) => r.tag_id)).toEqual([old.id])
    expect(tagsOf([link(old)], [work, old], 'task', 'item-0000-0000-0000-000000000001').map((t) => t.name)).toEqual(['old'])
  })
})

describe('Spec §5 Global search', () => {
  const docs = searchDocs({
    tasks: [{ id: 't1', title: 'Book café table', notes: 'for Sam', due_date: '2026-11-10', status: 'open', source: 'manual', updated_at: '2026-11-02', deleted_at: null }],
    vaultItems: [{ id: 'v1', bucket_id: 'b1', title: 'Luigi’s', notes: 'Best café in town', updated_at: '2026-11-05', deleted_at: null }],
    buckets: [{ id: 'b1', name: 'Restaurant reviews', position: 0, deleted_at: null }],
    journal: [{ id: 'j1', date: '2026-11-09', body: '<p>Met Sam at the <strong>cafe</strong>.</p>', stats: {}, stats_final: true, auto: false, updated_at: '2026-11-09', deleted_at: null }],
    quests: [{ id: 'q1', title: 'Learn to bake', status: 'open', updated_at: '2026-11-01', deleted_at: null }],
    events: [{ ...newEvent(UID, '2026-11-12', '10:00', 'e1'), title: 'Dentist', notes: 'bring card', updated_at: '2026-11-03' }],
    itemTags: [{ id: 'it1', tag_id: 'tag-food', item_type: 'vault_item', item_id: 'v1', deleted_at: null }],
  })

  it('matches every word, ignoring case and accents, across tasks, vault, journal, quests and events', () => {
    expect(fold('Café')).toBe('cafe')
    expect(search(docs, 'CAFE').map((d) => d.id)).toEqual(['t1', 'j1', 'v1']) // title match first, then most recent
    expect(search(docs, 'cafe sam').map((d) => d.type)).toEqual(['journal_entry', 'task'])
    expect(search(docs, 'dentist card')[0]).toMatchObject({ type: 'event', date: '2026-11-12' })
    expect(search(docs, 'bake')[0]).toMatchObject({ type: 'quest' })
    expect(search(docs, '')).toEqual([])
  })

  it('results can be filtered by tag, and a tag alone lists everything with it', () => {
    expect(search(docs, 'cafe', ['tag-food']).map((d) => d.id)).toEqual(['v1'])
    expect(search(docs, '', ['tag-food']).map((d) => d.id)).toEqual(['v1'])
  })

  it('a result shows the words around what was found, without formatting', () => {
    expect(snippet(search(docs, 'cafe').find((d) => d.id === 'j1')!, 'cafe')).toBe('Met Sam at the cafe.')
  })
})
