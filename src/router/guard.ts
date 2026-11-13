import type { RouteLocationNormalized } from 'vue-router'

/** SPEC §8: every screen except the home page and the public pages needs a signed-in user; signed out, it's the home page. */
export function authRedirect(to: Pick<RouteLocationNormalized, 'name' | 'meta'>, isSignedIn: boolean) {
  if (to.meta.guest || to.meta.landing || to.meta.public) return true
  return isSignedIn ? true : { path: '/' }
}
