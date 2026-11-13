import { describe, expect, it } from 'vitest'
import { cleanHtml, normalizeBody, plainText, toEditorHtml, wordsIn, writingFacts, wroteIn } from '@/journal/body'

describe('Spec §5 Journal: formatted writing', () => {
  it('entries written as plain text open in the editor as paragraphs', () => {
    expect(toEditorHtml('Line one\nLine <two>')).toBe('<p>Line one</p><p>Line &lt;two&gt;</p>')
    expect(toEditorHtml('<p><strong>Hi</strong></p>')).toBe('<p><strong>Hi</strong></p>')
  })

  it('bold, italic, lists, checklists, quotes and links are kept', () => {
    const html =
      '<p><strong>B</strong> <em>I</em> <u>U</u> <s>S</s></p><h2>H</h2><ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked=""></label><div><p>c</p></div></li></ul>' +
      '<blockquote><p>q</p></blockquote>'
    const out = cleanHtml(html)
    for (const tag of ['<strong>', '<em>', '<u>', '<s>', '<h2>', '<ol>', '<blockquote>', 'data-type="taskList"', 'data-checked="true"']) {
      expect(out).toContain(tag)
    }
  })

  it('links open in a new tab safely, and only web, email and phone links are allowed', () => {
    expect(cleanHtml('<p><a href="https://example.com">x</a></p>')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
    )
    expect(cleanHtml('<p><a href="javascript:alert(1)">x</a></p>')).not.toContain('javascript')
  })

  it('scripts, styles and event handlers are removed', () => {
    const out = cleanHtml('<p onclick="steal()" style="color:red">hi</p><script>steal()</script><img src=x onerror="steal()">')
    expect(out).toBe('<p>hi</p>')
  })

  it('an empty editor counts as nothing written', () => {
    expect(normalizeBody('<p></p>')).toBe('')
    expect(normalizeBody('<ul><li><p> </p></li></ul>')).toBe('')
    expect(normalizeBody('<p>Good day</p>')).toBe('<p>Good day</p>')
  })

  it('plain words can be read back without formatting', () => {
    expect(plainText('<p><strong>Good</strong> day</p><ul><li><p>rent</p></li></ul>')).toBe('Good day rent')
  })
})

describe('SPEC §5 Locking my journal: the facts kept beside the writing', () => {
  it('counts words across paragraphs and list items, and nothing for an empty editor', () => {
    expect(writingFacts('<p>Good day</p><ul><li><p>paid rent</p></li></ul>')).toEqual({ word_count: 4, has_writing: true })
    expect(writingFacts('<ul><li><p> </p></li></ul>')).toEqual({ word_count: 0, has_writing: false })
  })

  it('reads the stored facts, and never counts encrypted writing as words when they are missing', () => {
    const encrypted = { body: 'enc:v1:AAAA BBBB CCCC' }
    expect([wroteIn(encrypted), wordsIn(encrypted)]).toEqual([false, 0])
    expect([wroteIn({ ...encrypted, has_writing: true, word_count: 12 }), wordsIn({ ...encrypted, has_writing: true, word_count: 12 })]).toEqual([true, 12])
    expect([wroteIn({ body: '<p>two words</p>' }), wordsIn({ body: '<p>two words</p>' })]).toEqual([true, 2])
  })
})
