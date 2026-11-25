import { describe, expect, it, vi } from 'vitest'
import { useSettingSave } from '@/composables/useSettingSave'
import type { ServerReason } from '@/server/server'
import { messages } from '@/messages'


describe('SPEC §5 Account page: a setting says Saved, or why it didn\'t save', () => {
  it.each<[string, () => Promise<ServerReason | null | void>, string]>([
    ['saved', async () => null, messages.profile.saved],
    ['a save with no answer (a device-only setting like Pause all streaks)', async () => {}, messages.profile.saved],
    ['offline', async () => 'offline', messages.profile.offline],
    ['failed online', async () => 'failed', messages.profile.saveFailed],
    ['a save that throws (Pause all streaks failing on the device)', async () => {
      throw new Error('IndexedDB said no')
    }, messages.profile.saveFailed],
  ])('%s', async (_, run, said) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const setting = useSettingSave()
    const ok = await setting.save(run)
    expect({ ok, notice: setting.notice, failed: setting.failed }).toEqual({
      ok: said === messages.profile.saved,
      notice: said,
      failed: said !== messages.profile.saved,
    })
  })

  it('a new save takes the last note away while it runs, and only the latest save\'s answer shows', async () => {
    const setting = useSettingSave()
    await setting.save(async () => 'failed')
    let finishFirst!: (why: ServerReason | null) => void
    const first = setting.save(() => new Promise((resolve) => (finishFirst = resolve)))
    expect(setting.notice).toBe('')
    await setting.save(async () => null)
    finishFirst('offline')
    await first
    expect(setting.notice).toBe(messages.profile.saved)
  })

  it('clearing (a check refused the save) leaves no note, even when an earlier save answers later', async () => {
    const setting = useSettingSave()
    let finish!: (why: ServerReason | null) => void
    const running = setting.save(() => new Promise((resolve) => (finish = resolve)))
    setting.clear()
    finish(null)
    await running
    expect({ notice: setting.notice, saving: setting.saving }).toEqual({ notice: '', saving: false })
  })
})
