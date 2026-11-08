// Come back to a page after signing in (SPEC §10 Connections: connect links, and creating an account from a guest
// invitation). Kept for this tab only.
import { safeNext } from '@/security/redirect'

const RETURN_KEY = 'my-brain:after-sign-in'
export function rememberReturn(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path)
  } catch {
    // Storage blocked: sign-in just lands on the home page.
  }
}
export function takeReturn(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return path ? safeNext(path) : null
  } catch {
    return null
  }
}
