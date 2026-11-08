import { describe, expect, it } from 'vitest'
import { devSignInEnabled } from './devSignIn'

describe('Spec §3 Testing: the dev-only sign-in never reaches a production build', () => {
  it('shows only on the dev server with VITE_DEV_SIGN_IN=true', () => {
    expect(devSignInEnabled({ DEV: true, VITE_DEV_SIGN_IN: 'true' })).toBe(true)
    expect(devSignInEnabled({ DEV: false, VITE_DEV_SIGN_IN: 'true' })).toBe(false)
    expect(devSignInEnabled({ DEV: true })).toBe(false)
    expect(devSignInEnabled({ DEV: true, VITE_DEV_SIGN_IN: 'false' })).toBe(false)
  })
})
