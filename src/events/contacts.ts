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
