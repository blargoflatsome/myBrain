// SPEC §5 Focus timer: the soft chime when a part ends, the app's one sound (SPEC §2 Sound). Shared with the TV's
// timer (SPEC §9).

// One sound context for the page's life: browsers allow only a few, so a timer chiming all day can't open a new one
// each time.
let shared: AudioContext | null = null

/** Two soft rising notes. With no sound available, nothing happens: the screen still shows the new part. */
export function chime() {
  try {
    const audio = (shared ??= new AudioContext())
    // A context the browser suspended between chimes (a phone in the background) starts again.
    if (audio.state === 'suspended') void audio.resume().catch(() => {})
    for (const [i, freq] of [660, 880].entries()) {
      const tone = audio.createOscillator()
      const gain = audio.createGain()
      tone.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.25)
      gain.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + i * 0.25 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.25 + 0.4)
      tone.connect(gain).connect(audio.destination)
      tone.start(audio.currentTime + i * 0.25)
      tone.stop(audio.currentTime + i * 0.25 + 0.45)
    }
  } catch {
    // No sound available: the vibration and the screen still show it.
  }
}
