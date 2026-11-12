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
})

