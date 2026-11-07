// Web Push only ever goes to a real browser push service (docs/SPEC.md §8 Security). A push address is stored by the
// person who owns it, so the sender checks it first: otherwise someone could store any address and make our server
// send requests to it.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, most Android browsers
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/, // Safari
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
]

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2000) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false
  return PUSH_HOSTS.some((host) => host.test(url.hostname.toLowerCase()))
}
