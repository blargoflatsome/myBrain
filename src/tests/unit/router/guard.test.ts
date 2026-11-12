import { describe, expect, it } from 'vitest'
import { authRedirect } from '@/router/guard'

const home = { name: 'home', meta: {} }
const signIn = { name: 'sign-in', meta: { public: true } }

describe('Spec §8: every screen except sign-in needs a signed-in user', () => {
  it('sends a signed-out visitor to the sign-in screen', () => {
    expect(authRedirect(home, false)).toEqual({ name: 'sign-in' })
  })

  it('lets a signed-in user open app screens', () => {
    expect(authRedirect(home, true)).toBe(true)
  })

  it('lets a signed-out visitor see the sign-in screen', () => {
    expect(authRedirect(signIn, false)).toBe(true)
  })

  it('sends a signed-in user away from the sign-in screen to home', () => {
    expect(authRedirect(signIn, true)).toEqual({ name: 'home' })
  })
})
