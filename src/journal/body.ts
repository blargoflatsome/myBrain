// Journal writing is formatted text (SPEC §5 Journal): bold, italic, underline, strikethrough, headings, lists,
// checklists, quotes and links. It is stored as HTML limited to those elements, and cleaned before it is shown.
import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'label', 'input', 'div', 'span']
const ALLOWED_ATTR = ['href', 'target', 'rel', 'type', 'checked', 'disabled', 'data-type', 'data-checked']

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Entries written before formatting existed are plain text: each line becomes a paragraph. */
export function toEditorHtml(body: string): string {
  if (!body) return ''
  if (body.trimStart().startsWith('<')) return body
  return body
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

// The only form control the editor makes is a checklist box: any other input (a password box, a button) is removed.
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'input' && (node as Element).getAttribute?.('type') !== 'checkbox') node.parentNode?.removeChild(node)
})

/** Only the formatting the editor offers survives; scripts, styles and event handlers are removed. Links open safely. */
export function cleanHtml(html: string): string {
  // Links may only be web, email or phone links. `type` is listed as safe so a checklist box keeps type="checkbox"
  // (with a strict link rule, DOMPurify otherwise drops any attribute whose value doesn't look like an allowed link);
  // the hook above already removes every input that isn't a checkbox.
  const clean = DOMPurify.sanitize(toEditorHtml(html), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
    ADD_URI_SAFE_ATTR: ['type'],
  })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  for (const a of doc.querySelectorAll('a')) {
    a.setAttribute('target', '_blank')
    a.setAttribute('rel', 'noopener noreferrer nofollow')
  }
  return doc.body.innerHTML
}

/** The words, without formatting (for "did I write anything?" and, later, search). */
export function plainText(html: string): string {
  if (!html) return ''
  // A space after each block, so words in separate paragraphs or list items stay apart.
  const spaced = toEditorHtml(html).replace(/<\/(p|li|h2|h3|blockquote|div)>/g, '$& ')
  const doc = new DOMParser().parseFromString(spaced, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** What to store: cleaned HTML, or '' when nothing was written (an empty editor still holds an empty paragraph). */
export function normalizeBody(html: string): string {
  return plainText(html) ? cleanHtml(html) : ''
}
