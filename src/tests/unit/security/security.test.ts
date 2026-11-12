import { describe, expect, it } from 'vitest'
import { isPushEndpoint } from '@/notifications/pushEndpoints'
import { safeNext } from '@/security/redirect'
import { cleanHtml } from '@/journal/body'
import { icsFile } from '@/events/ics'
import { linkTarget } from '@/vault/rules'
import { fitTitle, TITLE_MAX } from '@/capture/capture'

describe('Spec §8 Security: push goes only to real browser push services', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-by3p.notify.windows.com/w/?token=abc',
  ])('%s is allowed', (url) => expect(isPushEndpoint(url)).toBe(true))

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost:8080/x',
    'https://fcm.googleapis.com.evil.example/x',
    'https://evil.example/?fcm.googleapis.com',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'javascript:alert(1)',
    `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
    42,
  ])('%s is refused', (url) => expect(isPushEndpoint(url)).toBe(false))
})

describe('Spec §8 Security: redirects stay inside the app', () => {
  it.each([
    ['/journal', '/journal'],
    ['/vault?bucket=1', '/vault?bucket=1'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    ['javascript:alert(1)', '/'],
    [undefined, '/'],
  ])('%s → %s', (given, expected) => expect(safeNext(given)).toBe(expected))
})

describe('Spec §8 Security: formatted writing can never run code', () => {
  it.each([
    ['<script>alert(1)</script><p>hi</p>', '<p>hi</p>'],
    ['<img src=x onerror="alert(1)"><p>hi</p>', '<p>hi</p>'],
    ['<p onclick="alert(1)">hi</p>', '<p>hi</p>'],
    ['<a href="javascript:alert(1)">x</a>', '<a target="_blank" rel="noopener noreferrer nofollow">x</a>'],
    ['<iframe src="https://evil.example"></iframe><p>hi</p>', '<p>hi</p>'],
    ['<svg onload="alert(1)"><circle/></svg><p>hi</p>', '<p>hi</p>'],
    ['<input type="password" name="pw"><p>hi</p>', '<p>hi</p>'],
    ['<form action="https://evil.example"><p>hi</p></form>', '<p>hi</p>'],
    ['<p style="background:url(https://evil.example)">hi</p>', '<p>hi</p>'],
  ])('%s is cleaned', (dirty, clean) => expect(cleanHtml(dirty)).toBe(clean))

  it('keeps the checklist boxes the editor makes', () => {
    expect(cleanHtml('<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>x</p></div></li></ul>')).toContain('type="checkbox"')
  })

  it('typed entities stay as text, shown exactly as typed', () => {
    // Plain text: "&lt;" is shown as those four characters, never turned into "<".
    expect(cleanHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<p>&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;</p>')
    // Formatted writing: an escaped tag stays escaped.
    expect(cleanHtml('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('a checklist box keeps type="checkbox", but no other input survives', () => {
    expect(cleanHtml('<p><input type="text" value="x"><input type="checkbox"></p>')).toBe('<p><input type="checkbox"></p>')
  })
})

describe('Spec §8 Security: calendar files', () => {
  it('typed line breaks (including a lone carriage return) can never add calendar lines', () => {
    const file = icsFile(
      { uid: 'u1', title: 'Party\rATTENDEE:mailto:evil@example.com\r\nX:1\nY:2', notes: 'a;b,c\\d', start_date: '2026-11-20', start_time: '19:00', end_date: '2026-11-20', end_time: '22:00', repeat: 'never', timezone: 'America/New_York', organizer: 'Bob: "the" Builder;\rX-EVIL:1' },
      new Date('2026-11-10T00:00:00Z'),
    )
    const lines = file.split('\r\n')
    expect(lines.filter((l) => l.startsWith('ATTENDEE') || l.startsWith('X:') || l.startsWith('Y:') || l.startsWith('X-EVIL'))).toEqual([])
    expect(lines.find((l) => l.startsWith('SUMMARY:'))).toBe('SUMMARY:Party\\nATTENDEE:mailto:evil@example.com\\nX:1\\nY:2')
    expect(lines.find((l) => l.startsWith('DESCRIPTION:'))).toBe('DESCRIPTION:a\\;b\\,c\\\\d')
    expect(lines.find((l) => l.startsWith('ORGANIZER'))).toBe('ORGANIZER;CN="Bob:  the  Builder; X-EVIL:1":invalid:nomail')
  })
})

describe('Spec §8 Security: links and long titles', () => {
  it('a Vault link can never be a script', () => {
    for (const link of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x']) {
      expect(linkTarget(link).href).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//)
    }
  })

  it('an overlong first line is shortened for the title and kept whole in the notes', () => {
    const long = 'a'.repeat(700)
    const fitted = fitTitle(`${long}\nsecond line`, 'my notes')
    expect(fitted.title).toHaveLength(TITLE_MAX)
    expect(fitted.notes).toBe(`${long}\nsecond line\n\nmy notes`)
    expect(fitTitle('Short\nrest', null)).toEqual({ title: 'Short', notes: 'rest' })
  })
})
