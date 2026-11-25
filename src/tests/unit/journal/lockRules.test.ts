import { describe, expect, it } from 'vitest'
import { MAX_TRIES, WAIT_MS, lockSteps, nextStep, passphraseProblem, waitLeft } from '@/journal/lockRules'

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

describe('SPEC §5 Locking my journal: the screens of each lock flow', () => {
  it.each([
    ['setup', true, ['passphrase', 'recovery', 'passkey', 'done']],
    ['setup', false, ['passphrase', 'recovery', 'done']],
    ['startOver', true, ['passphrase', 'recovery', 'passkey', 'done']],
    ['startOver', false, ['passphrase', 'recovery', 'done']],
    ['passphrase', true, ['prove', 'passphrase', 'done']],
    ['recovery', true, ['prove', 'recovery']],
    ['passkey', false, ['prove', 'passkey', 'done']],
    ['off', true, ['prove', 'off']],
  ] as const)('%s (passkeys here: %s) → %j', (action, canPasskey, steps) => {
    expect(lockSteps(action, canPasskey)).toEqual(steps)
  })

  it('the window closes after the last screen of a flow with no done screen', () => {
    expect(nextStep('recovery', 'recovery', true)).toBeNull()
    expect(nextStep('off', 'off', true)).toBeNull()
    expect(nextStep('setup', 'recovery', false)).toBe('done')
  })
})
