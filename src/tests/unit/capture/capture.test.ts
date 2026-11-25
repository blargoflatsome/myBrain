import { describe, expect, it } from 'vitest'
import { buildBucket, sharedText, splitTitle } from '@/capture/capture'

describe('Spec §5 Quick capture: shared and long text', () => {
  it('shared text: the first line becomes the title, the rest the notes', () => {
    expect(splitTitle('Great recipe\nhttps://example.com/soup\nfrom Sam')).toEqual({
      title: 'Great recipe',
      rest: 'https://example.com/soup\nfrom Sam',
    })
    expect(splitTitle('just one line')).toEqual({ title: 'just one line', rest: '' })
  })

  it('a new bucket can be created from the bucket picker', () => {
    expect(buildBucket(' Gift ideas ', 3, 'u1', () => 'fixed-id')).toEqual({ id: 'fixed-id', user_id: 'u1', name: 'Gift ideas', position: 3, deleted_at: null })
  })
})

describe('Spec §3: Web Share Target fills the capture text', () => {
  it('joins shared title, text and url without repeats', () => {
    expect(sharedText({ title: 'Cool article', text: 'https://x.test/a', url: 'https://x.test/a' })).toBe(
      'Cool article\nhttps://x.test/a',
    )
  })

  it('is empty when nothing was shared', () => {
    expect(sharedText({})).toBe('')
  })
})
