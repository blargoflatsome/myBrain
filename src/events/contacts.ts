// Contact details typed for invitations (SPEC §5 Shared events).

/** A phone number: digits with optional +, spaces, dashes, dots and brackets; 7 to 15 digits. */
export function isPhone(text: string): boolean {
  const t = text.trim()
  if (!/^\+?[0-9 ().-]{7,24}$/.test(t)) return false
  const digits = t.replace(/\D/g, '').length
  return digits >= 7 && digits <= 15
}

export function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text.trim())
}

/** Sort a typed contact into an email or a phone number (or neither). */
export function parseContact(text: string): { email?: string; phone?: string } | null {
  const t = text.trim()
  if (isEmail(t)) return { email: t.toLowerCase() }
  if (isPhone(t)) return { phone: t }
  return null
}

/** The same email (any case) or phone number (any formatting) is the same person. */
export function contactKey(p: { email?: string | null; phone?: string | null }): string | null {
  if (p.email) return `e:${p.email.trim().toLowerCase()}`
  if (p.phone) return `p:${p.phone.replace(/\D/g, '')}`
  return null
}

export interface RememberedPerson {
  name?: string
  email?: string
  phone?: string
}

/**
 * People I've invited before by email or phone (SPEC §5 Calendar: remembered people), from my own invitations: each
 * person once, with the name I used most recently, most recently invited first.
 */
export function rememberedPeople(
  invites: { user_id?: string; name?: string | null; email?: string | null; phone?: string | null; created_at?: string }[],
  me: string | null,
): RememberedPerson[] {
  const byKey = new Map<string, RememberedPerson & { at: string }>()
  for (const i of invites) {
    if (!me || i.user_id !== me) continue
    const key = contactKey(i)
    if (!key) continue
    const at = i.created_at ?? ''
    const known = byKey.get(key)
    if (known && known.at >= at) continue
    byKey.set(key, { name: i.name ?? known?.name ?? undefined, email: i.email ?? undefined, phone: i.email ? undefined : (i.phone ?? undefined), at })
  }
  return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).map(({ name, email, phone }) => ({ name, email, phone }))
}

/** Up to `limit` remembered people matching what I typed (name, email or phone digits), leaving out `exclude` keys. */
export function matchRemembered(people: RememberedPerson[], typed: string, exclude: Set<string>, limit = 5): RememberedPerson[] {
  const words = typed.trim().toLowerCase()
  if (!words) return []
  const digits = words.replace(/\D/g, '')
  return people
    .filter((p) => !exclude.has(contactKey(p) ?? ''))
    .filter(
      (p) =>
        (p.name ?? '').toLowerCase().includes(words) ||
        (p.email ?? '').toLowerCase().includes(words) ||
        (digits.length >= 3 && (p.phone ?? '').replace(/\D/g, '').includes(digits)),
    )
    .slice(0, limit)
}
