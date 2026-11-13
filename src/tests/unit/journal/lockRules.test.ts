import { describe, expect, it } from 'vitest'
import { MAX_TRIES, WAIT_MS, passphraseProblem, waitLeft } from '@/journal/lockRules'

describe('SPEC §5 Locking my journal: passphrase rules', () => {
  it.each([
    ['eleven char', 'eleven char', 'short'],
    ['twelve chars', 'twelve charz', 'mismatch'],
    ['twelve chars', 'twelve chars', null],
  ])('%s / %s → %s', (pass, repeat, problem) => {
    expect(passphraseProblem(pass, repeat)).toBe(problem)
  })

  it('waits 30 seconds after 5 wrong tries, and not before', () => {
    expect(waitLeft(MAX_TRIES - 1, 1000, 1000)).toBe(0)
    expect(waitLeft(MAX_TRIES, 1000, 1000)).toBe(WAIT_MS)
    expect(waitLeft(MAX_TRIES, 1000, 1000 + WAIT_MS)).toBe(0)
  })
})
