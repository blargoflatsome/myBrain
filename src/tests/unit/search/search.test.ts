import { describe, expect, it } from 'vitest'
import { newEvent } from '@/events/rules'
import { fold, search, searchDocs, snippet } from '@/search/search'

const UID = '11111111-2222-4333-8444-555555555555'

describe('Spec §5 Global search', () => {
  const docs = searchDocs({
    tasks: [{ id: 't1', title: 'Book café table', notes: 'for Sam', due_date: '2026-11-10', status: 'open', source: 'manual', updated_at: '2026-11-02', deleted_at: null }],
    vaultItems: [{ id: 'v1', bucket_id: 'b1', title: 'Luigi’s', notes: 'Best café in town', updated_at: '2026-11-05', deleted_at: null }],
    buckets: [{ id: 'b1', name: 'Restaurant reviews', position: 0, deleted_at: null }],
    journal: [{ id: 'j1', date: '2026-11-09', body: '<p>Met Sam at the <strong>cafe</strong>.</p>', stats: {}, stats_final: true, auto: false, updated_at: '2026-11-09', deleted_at: null }],
    quests: [{ id: 'q1', title: 'Learn to bake', status: 'open', updated_at: '2026-11-01', deleted_at: null }],
    events: [{ ...newEvent(UID, '2026-11-12', '10:00', 'e1'), title: 'Dentist', notes: 'bring card', updated_at: '2026-11-03' }],
    invites: [],
    me: UID,
    habits: [],
    routines: [],
    itemTags: [{ id: 'it1', tag_id: 'tag-food', item_type: 'task', item_id: 't1', deleted_at: null }],
  })

  it('matches every word, ignoring case and accents, across tasks, vault, journal, quests and events', () => {
    expect(fold('Café')).toBe('cafe')
    expect(search(docs, 'CAFE').map((d) => d.id)).toEqual(['t1', 'j1', 'v1']) // title match first, then most recent
    expect(search(docs, 'cafe sam').map((d) => d.type)).toEqual(['journal_entry', 'task'])
    expect(search(docs, 'dentist card')[0]).toMatchObject({ type: 'event', date: '2026-11-12' })
    expect(search(docs, 'bake')[0]).toMatchObject({ type: 'quest' })
    expect(search(docs, '')).toEqual([])
  })

  it('results can be filtered by tag (tags are on tasks, habits and routines), and a tag alone lists everything with it', () => {
    expect(search(docs, 'cafe', ['tag-food']).map((d) => d.id)).toEqual(['t1'])
    expect(search(docs, '', ['tag-food']).map((d) => d.id)).toEqual(['t1'])
  })

  it('a result shows the words around what was found, without formatting', () => {
    expect(snippet(search(docs, 'cafe').find((d) => d.id === 'j1')!, 'cafe')).toBe('Met Sam at the cafe.')
  })

  it('SPEC §5 Locking my journal: writing still encrypted on this device is left out, not searched as gibberish', () => {
    const locked = searchDocs({
      tasks: [], vaultItems: [], buckets: [], quests: [], events: [], invites: [], me: UID, habits: [], routines: [], itemTags: [],
      journal: [{ id: 'j2', date: '2026-11-08', body: 'enc:v1:c2VjcmV0', tomorrow: '<p>call Sam</p>', stats: {}, stats_final: true, auto: false, deleted_at: null }],
    })
    expect(search(locked, 'enc')).toEqual([])
    expect(search(locked, 'sam').map((d) => d.id)).toEqual(['j2'])
  })

  it('SPEC §5 Global search, Important journals: only days I marked Important, newest day first, or the ones matching my words; a locked one is still listed by date', () => {
    const entry = (id: string, date: string, body: string, important: boolean, updated_at: string) => ({ id, date, body, important, stats: {}, stats_final: true, auto: false, updated_at, deleted_at: null })
    const marked = searchDocs({
      tasks: [{ id: 't1', title: 'An insight to act on', due_date: null, status: 'open', source: 'manual', updated_at: '2026-11-20', deleted_at: null }],
      vaultItems: [], buckets: [], quests: [], events: [], invites: [], me: UID, habits: [], routines: [], itemTags: [],
      journal: [
        entry('old', '2026-11-01', '<p>An insight about sleep</p>', true, '2026-11-25'),
        entry('new', '2026-11-20', '<p>Talked to Sam</p>', true, '2026-11-20'),
        entry('plain', '2026-11-21', '<p>An insight, not marked</p>', false, '2026-11-21'),
        entry('locked', '2026-11-10', 'enc:v1:c2VjcmV0', true, '2026-11-10'),
      ],
    })
    expect(search(marked, '', [], true).map((d) => d.id)).toEqual(['new', 'locked', 'old'])
    expect(search(marked, 'insight', [], true).map((d) => d.id)).toEqual(['old'])
    expect(search(marked, 'insight').map((d) => d.id)).toEqual(['t1', 'old', 'plain']) // without the filter, unmarked days are found too
    expect(search(marked, '2026-11-10').map((d) => d.id)).toEqual([]) // a locked day isn't found by words, only listed
  })

  it('SPEC §5 Shared events: an event I said No to or dropped out of is not found; one I said Yes to is', () => {
    const HOST = '99999999-2222-4333-8444-555555555555'
    const party = (id: string) => ({ ...newEvent(HOST, '2026-11-20', '19:00', id), title: 'Party' })
    const invited = searchDocs({
      tasks: [], vaultItems: [], buckets: [], quests: [], journal: [], habits: [], routines: [], itemTags: [], me: UID,
      events: [party('yes'), party('no'), party('dropped')],
      invites: (['yes', 'no', 'dropped'] as const).map((r) => ({ id: `i-${r}`, event_id: r, response: r, deleted_at: null })),
    })
    expect(search(invited, 'party').map((d) => d.id)).toEqual(['yes'])
  })
})
