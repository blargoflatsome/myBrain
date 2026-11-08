// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { INVITE_CONTACT_PATH, routeShare } from './target'

function form(fields: Record<string, string>, files: File[] = []) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  for (const file of files) f.append('contacts', file)
  return f
}

describe('Spec §3 PWA share target: contact files go to the invite screen, text still goes to Capture', () => {
  it('a shared contact file is kept for the invite screen', async () => {
    const kept: string[] = []
    const vcf = new File(['BEGIN:VCARD\r\nFN:Allie Hannah\r\nTEL:5094348303\r\nEND:VCARD'], 'Allie.vcf', { type: 'text/x-vcard' })
    const to = await routeShare(form({ title: 'Allie Hannah' }, [vcf]), async (t) => void kept.push(t))
    expect(to).toBe(INVITE_CONTACT_PATH)
    expect(kept).toHaveLength(1)
    expect(kept[0]).toContain('FN:Allie Hannah')
  })

  it('several files are joined, and no more than 1 MB is read', async () => {
    const kept: string[] = []
    const big = new File(['x'.repeat(1024 * 1024 + 500)], 'big.vcf')
    const small = new File(['BEGIN:VCARD\nEND:VCARD'], 'small.vcf')
    await routeShare(form({}, [big, small]), async (t) => void kept.push(t))
    expect(kept[0]!.length).toBeLessThanOrEqual(1024 * 1024 + 1)
    expect(kept[0]).not.toContain('BEGIN:VCARD')
  })

  it('shared text and links go to Capture, the way they always have', async () => {
    const to = await routeShare(form({ title: 'A page', text: 'Read this', url: 'https://example.com/a?b=1' }), async () => {
      throw new Error('nothing to keep')
    })
    expect(to).toBe('/capture?title=A+page&text=Read+this&url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1')
  })

  it('an empty share just opens Capture', async () => {
    expect(await routeShare(form({ text: '  ' }, [new File([], 'empty.vcf')]), async () => {})).toBe('/capture')
  })
})
