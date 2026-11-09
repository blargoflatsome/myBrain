import { describe, expect, it } from 'vitest'
import { isIOS } from './device'

describe('Spec §10 Phase 3: telling an iPhone apart', () => {
  it('knows iPhones and iPads (which call themselves a Mac with touch), not Android or a desktop Mac', () => {
    expect(isIOS({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toBe(true)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
    expect(isIOS({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)' })).toBe(false)
  })
})
