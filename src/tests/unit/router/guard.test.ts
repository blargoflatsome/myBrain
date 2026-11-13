import { describe, expect, it } from 'vitest'
import { authRedirect } from '@/router/guard'

const tasks = { name: 'home', meta: {} }
const home = { name: 'dashboard', meta: { landing: true } }
const privacy = { name: 'privacy', meta: { public: true, guest: true } }

describe('Spec §8: every screen except the home page and the public pages needs a signed-in user', () => {
  it('sends a signed-out visitor to the home page', () => {
    expect(authRedirect(tasks, false)).toEqual({ path: '/' })
  })

  it('lets a signed-in user open app screens', () => {
    expect(authRedirect(tasks, true)).toBe(true)
  })

  it('opens the home page signed in or out (SPEC §5 Home page: the Dashboard or the marketing page)', () => {
    expect(authRedirect(home, false)).toBe(true)
    expect(authRedirect(home, true)).toBe(true)
  })

  it('opens the public pages signed in or out', () => {
    expect(authRedirect(privacy, false)).toBe(true)
    expect(authRedirect(privacy, true)).toBe(true)
  })
})
