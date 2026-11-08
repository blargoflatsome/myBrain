// Contact files shared into My Brain from the phone's Contacts app (SPEC §5 Calendar, "Sharing a contact").
// Only each contact's name, first email and first phone number are read; the file is untrusted, so every value is
// checked and trimmed to size, and everything else in it (photos, addresses, notes) is ignored.
import { contactKey, isEmail, isPhone } from '@/events/contacts'
import type { PersonToInvite } from '@/events/sharing'
import { MAX_SHARED_BYTES } from '@/share/target'

/** Most people one share can bring in (an event holds up to 25). */
export const MAX_SHARED_CONTACTS = 25
const MAX_NAME = 120

export interface SharedContacts {
  people: PersonToInvite[]
  /** Contacts with no usable email or phone number. */
  skipped: number
  /** Usable contacts beyond the first 25, left out. */
  extra: number
}

interface Line {
  name: string
  params: string[]
  value: string
}

/** Join folded lines: a line starting with a space or tab continues the one before (vCard 3/4). */
function unfold(text: string): string[] {
  return text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

/** vCard 2.1 quoted-printable: `=XX` bytes (UTF-8), with `=` at a line end meaning the value continues. */
function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = []
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!
    const hex = value.slice(i + 1, i + 3)
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else bytes.push(...new TextEncoder().encode(c))
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

/** Undo vCard escaping: \, \; \n \\ . */
const unescape = (value: string) => value.replace(/\\([,;\\nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c))

function readLines(text: string): Line[] {
  const raw = unfold(text)
  const lines: Line[] = []
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i]!
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const head = line.slice(0, colon).split(';')
    const params = head.slice(1).map((p) => p.toUpperCase())
    const qp = params.some((p) => p === 'ENCODING=QUOTED-PRINTABLE' || p === 'QUOTED-PRINTABLE')
    // Quoted-printable values end a line with "=" when they carry on to the next (vCard 2.1).
    while (qp && line.endsWith('=') && i + 1 < raw.length) line = line.slice(0, -1) + raw[++i]!
    let value = line.slice(colon + 1)
    if (qp) value = decodeQuotedPrintable(value)
    // A group prefix ("item1.EMAIL") doesn't matter here.
    const name = head[0]!.split('.').at(-1)!.toUpperCase()
    lines.push({ name, params, value })
  }
  return lines
}

function nameOf(lines: Line[]): string | undefined {
  const fn = lines.find((l) => l.name === 'FN')
  let name = fn ? unescape(fn.value) : ''
  if (!name.trim()) {
    // N is family;given;middle;prefix;suffix.
    const n = lines.find((l) => l.name === 'N')
    if (n) {
      const [family = '', given = '', middle = ''] = n.value.split(/(?<!\\);/).map(unescape)
      name = [given, middle, family].filter((p) => p.trim()).join(' ')
    }
  }
  // Only plain text: no control characters, at most 120 characters.
  name = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  return name || undefined
}

function firstValid(lines: Line[], property: string, valid: (v: string) => boolean, clean: (v: string) => string): string | undefined {
  for (const l of lines) {
    if (l.name !== property) continue
    const value = clean(unescape(l.value))
    if (valid(value)) return value
  }
  return undefined
}

/** The people in a shared contact file (one or many vCards). */
export function readContactFile(text: string): SharedContacts {
  const people: PersonToInvite[] = []
  const seen = new Set<string>()
  let skipped = 0
  let extra = 0
  const cards = text.slice(0, MAX_SHARED_BYTES).split(/^BEGIN:VCARD\s*$/im).slice(1)
  for (const card of cards) {
    const lines = readLines(card.split(/^END:VCARD\s*$/im)[0] ?? '')
    const email = firstValid(lines, 'EMAIL', (v) => isEmail(v) && v.length <= 320, (v) => v.trim().toLowerCase())
    const phone = email ? undefined : firstValid(lines, 'TEL', isPhone, (v) => v.trim().replace(/^tel:/i, ''))
    if (!email && !phone) {
      skipped++
      continue
    }
    const person: PersonToInvite = { name: nameOf(lines), email, phone }
    const key = contactKey(person)!
    if (seen.has(key)) continue
    seen.add(key)
    if (people.length >= MAX_SHARED_CONTACTS) extra++
    else people.push(person)
  }
  return { people, skipped, extra }
}
