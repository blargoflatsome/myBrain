import { onScopeDispose, ref } from 'vue'

// Minimal typing for the Web Speech API, which TypeScript's DOM types don't include.
interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * SPEC §5: the mic button fills in the text with the device's speech recognition.
 * On Chrome the audio goes to Google for transcription (accepted in the spec). Unsupported browsers hide the button.
 */
export function useSpeech(onText: (finalText: string) => void) {
  const Ctor = recognitionCtor()
  const supported = Ctor !== null
  const listening = ref(false)
  const failed = ref(false)
  let rec: Recognition | null = null

  function start() {
    if (!Ctor || listening.value) return
    failed.value = false
    rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r?.isFinal) onText(r[0].transcript.trim())
      }
    }
    rec.onerror = () => {
      failed.value = true
    }
    rec.onend = () => {
      listening.value = false
    }
    listening.value = true
    rec.start()
  }

  function stop() {
    rec?.stop()
  }

  onScopeDispose(stop)
  return { supported, listening, failed, start, stop }
}
