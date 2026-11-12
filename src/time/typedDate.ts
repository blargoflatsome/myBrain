// SPEC §5 Date fields: the typed-date reader (parseDate.ts, with its date library) loads the first time a typed date box
// is shown, so phones, which use the device's own date picker, never load it.
type Parse = (text: string, today: string) => string | null

let parse: Parse | null = null
let loading: Promise<Parse> | null = null

/** The reader once it has loaded, else null (loadDateReader starts it). */
export const dateReader = (): Parse | null => parse

/** Load the reader; resolves to it. Safe to call again: it loads once. */
export function loadDateReader(): Promise<Parse> {
  loading ??= import('@/time/parseDate').then((mod) => (parse = mod.parseDate))
  return loading
}
