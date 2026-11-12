<template>
  <!-- Confetti is decoration only: hidden from screen readers, and it never catches a tap. -->
  <div class="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden="true" data-testid="confetti-layer">
    <div v-for="b in celebrate.bursts" :key="b.id" :ref="(el) => play(el as HTMLElement | null, b)" class="absolute" :style="{ left: `${b.x}px`, top: `${b.y}px` }" :data-size="b.size" data-testid="confetti" />
  </div>

  <!-- The message: a polite live region, so it's heard without interrupting. It never blocks the page under it. -->
  <div
    class="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-[81] flex justify-center px-4"
    role="status"
    aria-live="polite"
    data-testid="celebration"
  >
    <p
      v-if="celebrate.message"
      :key="celebrate.message.id"
      class="celebration-message max-w-sm rounded-2xl border border-line bg-surface px-4 py-3 text-center font-semibold text-ink shadow-lg [overflow-wrap:anywhere]"
      data-testid="celebration-message"
    >
      {{ celebrate.message.text }}
    </p>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Celebrations: the confetti bursts and the short message after finishing something.
import { useCelebrateStore, type Burst } from '@/stores/celebrate'

const celebrate = useCelebrateStore()

const PIECES = { small: 16, big: 48, biggest: 90 } as const
const SPREAD = { small: 70, big: 0.45, biggest: 0.6 } as const
const DURATION = { small: 900, big: 1600, biggest: 2200 } as const
const COLORS = ['var(--accent)', 'var(--done)', 'var(--prio-medium)', 'var(--prio-high)', 'var(--prio-low)', 'var(--star)']

const started = new Set<number>()

/** Throw the pieces out from the burst's point; they drift down and fade, then the burst is removed. */
function play(el: HTMLElement | null, b: Burst) {
  if (!el || started.has(b.id)) return
  started.add(b.id)
  const reach = b.size === 'small' ? SPREAD.small : Math.min(window.innerWidth, window.innerHeight) * SPREAD[b.size]
  const duration = DURATION[b.size]
  const runs: Promise<unknown>[] = []
  for (let i = 0; i < PIECES[b.size]; i++) {
    const piece = document.createElement('span')
    const size = 5 + Math.random() * 5
    piece.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size * (Math.random() < 0.5 ? 1 : 1.8)}px;background:${COLORS[i % COLORS.length]};border-radius:${Math.random() < 0.4 ? '50%' : '2px'}`
    el.append(piece)
    const angle = Math.random() * Math.PI * 2
    const distance = reach * (0.4 + Math.random() * 0.6)
    const dx = Math.cos(angle) * distance
    const dy = Math.sin(angle) * distance - reach * 0.3
    const turn = (Math.random() - 0.5) * 720
    const animation = piece.animate?.(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${turn / 2}deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx * 1.1}px, ${dy + reach * 0.6}px) rotate(${turn}deg)`, opacity: 0 },
      ],
      { duration: duration * (0.8 + Math.random() * 0.2), easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
    )
    if (animation) runs.push(animation.finished.catch(() => undefined))
  }
  void Promise.all(runs).then(() => {
    started.delete(b.id)
    celebrate.burstDone(b.id)
  })
}
</script>

<style scoped>
.celebration-message {
  animation: rise 250ms ease-out;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(-0.5rem);
  }
}
@media (prefers-reduced-motion: reduce) {
  .celebration-message {
    animation: none;
  }
}
</style>
