import { afterEach, describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useSpeech } from './useSpeech'

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
})

describe('Spec §5: microphone fills in the text with the device speech recognition', () => {
  it('hides the mic where the browser has no speech recognition', () => {
    const speech = effectScope().run(() => useSpeech(() => {}))!
    expect(speech.supported).toBe(false)
  })

  it('puts what was heard into the capture text', () => {
    class FakeRecognition {
      lang = ''
      interimResults = false
      continuous = false
      onresult: ((e: unknown) => void) | null = null
      onerror = null
      onend: (() => void) | null = null
      start() {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: ' buy stamps ' } }] })
        this.onend?.()
      }
      stop() {}
    }
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
    const heard: string[] = []
    const speech = effectScope().run(() => useSpeech((t) => heard.push(t)))!
    expect(speech.supported).toBe(true)
    speech.start()
    expect(heard).toEqual(['buy stamps'])
    expect(speech.listening.value).toBe(false)
  })
})
