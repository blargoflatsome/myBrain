import { describe, expect, it } from 'vitest'
import { cleanHtml, storedNotes, textLines } from '@/journal/body'
import { fitTitle } from '@/capture/capture'
import { icsFile } from '@/events/ics'

const TODAY = '2026-11-10' // a Tuesday

describe('Spec §5 Formatted notes', () => {
  it('an empty editor saves no notes; formatting is kept and cleaned', () => {
    expect(storedNotes('<p></p>')).toBeNull()
    expect(storedNotes('')).toBeNull()
    expect(storedNotes('<p><strong>Bring</strong> snacks</p><script>alert(1)</script>')).toBe('<p><strong>Bring</strong> snacks</p>')
  })

  it('notes written before formatting existed still show, as paragraphs', () => {
    expect(cleanHtml('line one\nline <two>')).toBe('<p>line one</p><p>line &lt;two&gt;</p>')
  })

  it('a long first line in Capture moves into formatted notes as a paragraph in front', () => {
    const { notes } = fitTitle('Title\nmore words', '<p><em>mine</em></p>')
    expect(notes).toBe('<p>more words</p><p><em>mine</em></p>')
    expect(fitTitle('Title\nmore', 'plain notes').notes).toBe('more\n\nplain notes')
  })

  it('calendar files get the notes as plain lines, never HTML', () => {
    expect(textLines('<p>Bring <strong>snacks</strong></p><ul><li><p>chips</p></li><li><p>dip</p></li></ul>')).toBe('Bring snacks\nchips\ndip')
    expect(textLines('plain\ntext')).toBe('plain\ntext')
    const ics = icsFile({ uid: 'u', title: 'Party', notes: '<p>Bring <em>snacks</em></p><p>Wear blue</p>', start_date: TODAY, start_time: null, end_date: TODAY, end_time: null, repeat: 'never', timezone: 'America/New_York' })
    expect(ics).toContain('DESCRIPTION:Bring snacks\\nWear blue')
    expect(ics).not.toContain('<p>')
  })
})

