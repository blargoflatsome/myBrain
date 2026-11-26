// SPEC §9 TV app, How it's built: the TV's engine is about Chrome 63. The build lowers newer syntax; these fill in the
// few newer built-ins the shared code or Vue may use. Each is added only when missing.

const define = (target: object, name: string, value: unknown) => {
  if (!(name in target)) Object.defineProperty(target, name, { value, configurable: true, writable: true })
}

if (typeof globalThis === 'undefined') Object.defineProperty(window, 'globalThis', { value: window, configurable: true, writable: true })
define(Object, 'fromEntries', (entries: Iterable<[PropertyKey, unknown]>) => {
  const out: Record<PropertyKey, unknown> = {}
  for (const [k, v] of entries) out[k] = v
  return out
})
define(Object, 'hasOwn', (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k))
define(Array.prototype, 'flat', function flat(this: unknown[], depth = 1): unknown[] {
  return depth < 1 ? this.slice() : this.reduce<unknown[]>((acc, v) => acc.concat(Array.isArray(v) ? (flat as (this: unknown[], d: number) => unknown[]).call(v, depth - 1) : [v]), [])
})
define(Array.prototype, 'flatMap', function flatMap(this: unknown[], fn: (v: unknown, i: number, a: unknown[]) => unknown, thisArg?: unknown) {
  return this.reduce<unknown[]>((acc, v, i, a) => acc.concat(fn.call(thisArg, v, i, a) as unknown[]), [])
})
function at(this: { length: number; [i: number]: unknown }, n: number) {
  const i = Math.trunc(n) || 0
  const k = i < 0 ? this.length + i : i
  return k < 0 || k >= this.length ? undefined : this[k]
}
define(Array.prototype, 'at', at)
define(String.prototype, 'at', at)
define(String.prototype, 'replaceAll', function replaceAll(this: string, find: string | RegExp, by: string) {
  return find instanceof RegExp ? this.replace(find, by) : this.split(find).join(by)
})
// A new run-anytime routine run needs a fresh id (SPEC §9 Routines); randomUUID came after Chrome 63.
if (typeof crypto !== 'undefined') {
  define(crypto, 'randomUUID', () => {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6]! & 0x0f) | 0x40
    b[8] = (b[8]! & 0x3f) | 0x80
    const h = Array.prototype.map.call(b, (x: number) => (x + 0x100).toString(16).slice(1)).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  })
}
