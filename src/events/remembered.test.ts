import { describe, expect, it } from 'vitest'
import { contactKey, matchRemembered, rememberedPeople } from './contacts'

const ME = 'me'
const invite = (name: string | null, contact: { email?: string; phone?: string }, at: string, user_id = ME) => ({ user_id, name, ...contact, created_at: at })

describe('Spec §5 Calendar: people I have invited before are remembered', () => {
  const people = rememberedPeople(
    [
      invite('Carol', { email: 'Carol@Example.com' }, '2026-11-01'),
      invite('Carol B', { email: 'carol@example.com' }, '2026-11-05'),
      invite('Dan', { phone: '(555) 010-3000' }, '2026-11-03'),
      invite('Dan the man', { phone: '555.010.3000' }, '2026-11-02'),
      invite('Bob', {}, '2026-11-04'),
      invite('Someone else', { email: 'x@example.com' }, '2026-11-06', 'other-host'),
    ],
    ME,
  )

  it('each person once (same email any case, same phone any format), with the latest name, newest first; only my own invitations', () => {
    expect(people).toEqual([
      { name: 'Carol B', email: 'carol@example.com', phone: undefined },
      { name: 'Dan', email: undefined, phone: '(555) 010-3000' },
    ])
  })

  it('matches what I type in the name, email or phone, and skips people already on the event', () => {
    expect(matchRemembered(people, 'carol', new Set()).map((p) => p.name)).toEqual(['Carol B'])
    expect(matchRemembered(people, 'EXAMPLE', new Set()).map((p) => p.name)).toEqual(['Carol B'])
    expect(matchRemembered(people, '5550103', new Set()).map((p) => p.name)).toEqual(['Dan'])
    expect(matchRemembered(people, '55', new Set())).toEqual([])
    expect(matchRemembered(people, '', new Set())).toEqual([])
    expect(matchRemembered(people, 'a', new Set([contactKey({ email: 'CAROL@example.com' })!])).map((p) => p.name)).toEqual(['Dan'])
  })
})
