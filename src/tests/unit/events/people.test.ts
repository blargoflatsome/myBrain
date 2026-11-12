import { describe, expect, it } from 'vitest'
import { matchesPerson, peopleToSave, sortPeople, uniquePeople } from '@/events/people'
import type { PersonRow } from '@/sync/types'

const row = (id: string, p: Partial<PersonRow>): PersonRow => ({ id, name: null, email: null, phone: null, deleted_at: null, ...p })

describe('Spec §5 Calendar, my people: typed guests are saved when the event is saved', () => {
  it('everyone typed by email or phone who isn’t saved yet is added; email is kept over phone', () => {
    const { add, rename } = peopleToSave([], [
      { name: 'Allie Hannah', phone: '(509) 434-8303' },
      { email: 'frank@example.com' },
      { name: 'Both', email: 'both@example.com', phone: '5550101000' },
    ])
    expect(add).toEqual([
      { name: 'Allie Hannah', email: null, phone: '(509) 434-8303' },
      { name: null, email: 'frank@example.com', phone: null },
      { name: 'Both', email: 'both@example.com', phone: null },
    ])
    expect(rename).toEqual([])
  })

  it('the same email (any case) or phone (any formatting) is the same person; a new name replaces the old one', () => {
    const saved = [row('p1', { name: 'Allie', phone: '509-434-8303' }), row('p2', { name: 'Frank', email: 'frank@example.com' })]
    const { add, rename } = peopleToSave(saved, [
      { name: 'Allie Hannah', phone: '(509) 434 8303' },
      { email: 'FRANK@example.com' },
      { name: 'Frank', email: 'frank@example.com' },
    ])
    expect(add).toEqual([])
    expect(rename).toEqual([{ id: 'p1', name: 'Allie Hannah' }])
  })

  it('people found by name (app users) aren’t saved, and someone typed twice is saved once', () => {
    const { add } = peopleToSave([], [{ user_id: 'u1', name: 'App User' }, { phone: '5550102000' }, { phone: '555 010 2000', name: 'Dan' }])
    expect(add).toEqual([{ name: null, email: null, phone: '5550102000' }])
  })
})

describe('Spec §5 Calendar, my people: listed A to Z, filtered by what I type', () => {
  it('sorts by name, else email or phone, ignoring case', () => {
    const people = [row('1', { name: 'carol' }), row('2', { email: 'bob@example.com' }), row('3', { name: 'Allie' }), row('4', { phone: '555' })]
    expect(sortPeople(people).map((p) => p.id)).toEqual(['4', '3', '2', '1'])
  })

  it('matches name or email in any case, or 3+ digits of a phone number in any formatting', () => {
    const allie = { name: 'Allie Hannah', email: null, phone: '(509) 434-8303' }
    expect(matchesPerson(allie, '')).toBe(true)
    expect(matchesPerson(allie, 'HANN')).toBe(true)
    expect(matchesPerson(allie, '434-83')).toBe(true)
    expect(matchesPerson(allie, '43')).toBe(false)
    expect(matchesPerson({ email: 'frank@example.com' }, 'Frank@')).toBe(true)
  })

  it('shows each person once, keeping the latest change', () => {
    const rows = [row('old', { name: 'Al', phone: '5094348303', updated_at: '2026-11-01' }), row('new', { name: 'Allie', phone: '509 434 8303', updated_at: '2026-11-05' })]
    expect(uniquePeople(rows).map((p) => p.id)).toEqual(['new'])
  })
})
