import { describe, expect, it } from 'vitest'
import { buildBucket, buildCaptureRecord, buildConversion, CaptureError, sharedText } from './capture'

const id = () => 'fixed-id'

describe('Spec §5 Quick capture: choose the destination each time', () => {
  it('Task: saves a captured task with source "capture"', () => {
    const rec = buildCaptureRecord({ text: ' call mom ', destination: 'task' }, 'u1', id)
    expect(rec).toEqual({
      table: 'tasks',
      row: { id: 'fixed-id', user_id: 'u1', deleted_at: null, title: 'call mom', due_date: null, status: 'open', source: 'capture' },
    })
  })

  it('Task: the date is optional, and blank goes to the Undated list', () => {
    expect(buildCaptureRecord({ text: 'x', destination: 'task', dueDate: '' }, 'u1', id).row).toMatchObject({ due_date: null })
  })

  it('Task: a chosen date schedules it for that day', () => {
    expect(buildCaptureRecord({ text: 'x', destination: 'task', dueDate: '2026-11-09' }, 'u1', id).row).toMatchObject({
      due_date: '2026-11-09',
    })
  })

  it('The Vault: saves into the chosen bucket', () => {
    const rec = buildCaptureRecord({ text: 'oat milk', destination: 'vault', bucketId: 'b1' }, 'u1', id)
    expect(rec.table).toBe('vault_items')
    expect(rec.row).toMatchObject({ bucket_id: 'b1', title: 'oat milk' })
  })

  it('The Vault: a bucket must be picked', () => {
    expect(() => buildCaptureRecord({ text: 'x', destination: 'vault' }, 'u1', id)).toThrow(CaptureError)
  })

  it('Quest: saves to the quest bucket', () => {
    expect(buildCaptureRecord({ text: 'learn to juggle', destination: 'quest' }, 'u1', id)).toMatchObject({
      table: 'quests',
      row: { title: 'learn to juggle', status: 'open' },
    })
  })

  it('Decide later: saves the raw text to the inbox', () => {
    expect(buildCaptureRecord({ text: 'hmm', destination: 'later' }, 'u1', id)).toMatchObject({
      table: 'inbox',
      row: { body: 'hmm' },
    })
  })

  it('refuses to save an empty thought', () => {
    expect(() => buildCaptureRecord({ text: '   ', destination: 'later' }, 'u1', id)).toThrow(CaptureError)
  })

  it('gives every capture a new device-made id', () => {
    const a = buildCaptureRecord({ text: 'a', destination: 'later' }, 'u1')
    const b = buildCaptureRecord({ text: 'b', destination: 'later' }, 'u1')
    expect(a.row.id).not.toBe(b.row.id)
  })

  it('a new bucket can be created from the bucket picker', () => {
    expect(buildBucket(' Gift ideas ', 3, 'u1', id)).toEqual({
      id: 'fixed-id',
      user_id: 'u1',
      name: 'Gift ideas',
      position: 3,
      deleted_at: null,
    })
  })
})

describe('Spec §5: any item can later be converted to another type', () => {
  it('a vault item becomes a task with the same words, and the vault item is retired', () => {
    const item = buildCaptureRecord({ text: 'book the dentist', destination: 'vault', bucketId: 'b1' }, 'u1', () => 'v1')
    const { create, retire } = buildConversion(item, { destination: 'task' }, 'u1', () => 't1')
    expect(create).toMatchObject({ table: 'tasks', row: { id: 't1', title: 'book the dentist', due_date: null } })
    expect(retire).toEqual({ table: 'vault_items', id: 'v1' })
  })

  it('filing an inbox item moves it to the chosen destination', () => {
    const later = buildCaptureRecord({ text: 'visit Lisbon', destination: 'later' }, 'u1', () => 'n1')
    const { create, retire } = buildConversion(later, { destination: 'vault', bucketId: 'places' }, 'u1')
    expect(create).toMatchObject({ table: 'vault_items', row: { title: 'visit Lisbon', bucket_id: 'places' } })
    expect(retire).toEqual({ table: 'inbox', id: 'n1' })
  })
})

describe('Spec §3: Web Share Target fills the capture text', () => {
  it('joins shared title, text and url without repeats', () => {
    expect(sharedText({ title: 'Cool article', text: 'https://x.test/a', url: 'https://x.test/a' })).toBe(
      'Cool article\nhttps://x.test/a',
    )
  })

  it('is empty when nothing was shared', () => {
    expect(sharedText({})).toBe('')
  })
})
