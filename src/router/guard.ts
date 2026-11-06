import type { RouteLocationNormalized } from 'vue-router'

/** SPEC §8: every screen except sign-in needs a signed-in user. */
export function authRedirect(to: Pick<RouteLocationNormalized, 'name' | 'meta'>, isSignedIn: boolean) {
  if (to.meta.public) {
    return to.name === 'sign-in' && isSignedIn ? { name: 'home' } : true
  }
  return isSignedIn ? true : { name: 'sign-in' }
}
