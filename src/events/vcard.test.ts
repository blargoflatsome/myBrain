import { describe, expect, it } from 'vitest'
import { MAX_SHARED_CONTACTS, readContactFile } from './vcard'

const card = (...lines: string[]) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n')

describe('Spec §5 Calendar, sharing a contact: only name, first email and first phone are read', () => {
  it('reads the name and the first email, and prefers email over phone', () => {
    const file = card('FN:Allie Hannah', 'TEL;TYPE=CELL:(509) 434-8303', 'EMAIL;TYPE=HOME:Allie@Example.com', 'EMAIL:second@example.com')
    expect(readContactFile(file)).toEqual({ people: [{ name: 'Allie Hannah', email: 'allie@example.com', phone: undefined }], skipped: 0, extra: 0 })
  })

  it('uses the first phone number when there is no email', () => {
    const file = card('FN:Dan', 'TEL;TYPE=CELL:(509) 434-8303', 'TEL;TYPE=WORK:555 010 3000')
    expect(readContactFile(file).people).toEqual([{ name: 'Dan', email: undefined, phone: '(509) 434-8303' }])
  })

  it('ignores photos, addresses and notes', () => {
    const file = card('FN:Erin', 'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQ', ' AAAQABAAD', 'ADR;TYPE=HOME:;;1 Main St;Town;;;', 'NOTE:secret', 'TEL:5550104000')
    expect(readContactFile(file).people).toEqual([{ name: 'Erin', email: undefined, phone: '5550104000' }])
  })

  it('reads several contacts in one file, once each', () => {
    const file = [card('FN:Erin', 'TEL:5550104000'), card('FN:Frank', 'EMAIL:frank@example.com'), card('FN:Erin again', 'TEL:555-010-4000')].join('\r\n')
    expect(readContactFile(file).people.map((p) => p.name)).toEqual(['Erin', 'Frank'])
  })

  it('counts contacts with no usable email or phone', () => {
    const file = [card('FN:No Number'), card('FN:Bad', 'EMAIL:not-an-email', 'TEL:12'), card('FN:Ok', 'TEL:5550104000')].join('\n')
    expect(readContactFile(file)).toMatchObject({ skipped: 2, people: [{ name: 'Ok' }] })
  })

  it('keeps the first 25 and counts the rest', () => {
    const file = Array.from({ length: 30 }, (_, i) => card(`FN:Person ${i}`, `TEL:555010${String(1000 + i)}`)).join('\n')
    const read = readContactFile(file)
    expect(read.people).toHaveLength(MAX_SHARED_CONTACTS)
    expect(read.extra).toBe(5)
  })

  it('reads vCard 2.1 from Android, with quoted-printable UTF-8 names and soft line breaks', () => {
    const file = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BC=',
      'ller',
      'TEL;CELL:+49 30 1234567',
      'END:VCARD',
    ].join('\r\n')
    expect(readContactFile(file).people).toEqual([{ name: 'Jürgen Müller', email: undefined, phone: '+49 30 1234567' }])
  })

  it('builds the name from N when there is no FN, and unfolds long lines', () => {
    const file = card('N:Hannah;Allie;;;', 'EMAIL:allie.hannah.with.a.really.long.address@exa', ' mple.com')
    expect(readContactFile(file).people).toEqual([{ name: 'Allie Hannah', email: 'allie.hannah.with.a.really.long.address@example.com', phone: undefined }])
  })

  it('reads vCard 4 phone links and grouped properties', () => {
    const file = card('FN:Grace', 'item1.EMAIL;type=INTERNET:grace@example.com', 'TEL;VALUE=uri;TYPE=cell:tel:+1-555-010-5000')
    expect(readContactFile(file).people).toEqual([{ name: 'Grace', email: 'grace@example.com', phone: undefined }])
    expect(readContactFile(card('FN:Hal', 'TEL;VALUE=uri:tel:+1-555-010-6000')).people[0]?.phone).toBe('+1-555-010-6000')
  })

  it('treats the file as untrusted: names are plain text, at most 120 characters, and escapes are undone', () => {
    const long = 'Remember to call the insurance company about the claim from the car accident last spring before Friday and then some more'
    const read = readContactFile(card(`FN:${long}`, 'TEL:5550104000'))
    expect(read.people[0]!.name!.length).toBe(120)
    expect(readContactFile(card('FN:Smith\\, Jo\\nBob\u0007', 'TEL:5550104000')).people[0]!.name).toBe('Smith, Jo Bob')
    expect(readContactFile(card('FN:<img src=x onerror=alert(1)>', 'TEL:5550104000')).people[0]!.name).toBe('<img src=x onerror=alert(1)>')
  })

  it('finds nothing in a file that is not a contact', () => {
    expect(readContactFile('hello there')).toEqual({ people: [], skipped: 0, extra: 0 })
  })
})
