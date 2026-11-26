<template>
  <svg class="tv-qr" :viewBox="`0 0 ${drawing.size} ${drawing.size}`" role="img" :aria-label="label" shape-rendering="crispEdges" data-testid="tv-qr">
    <rect :width="drawing.size" :height="drawing.size" fill="#fff" />
    <path :d="drawing.path" fill="#000" />
  </svg>
</template>

<script setup lang="ts">
// SPEC §9 Signing in by pairing: the QR code that opens pairing on my phone. Black on white in both themes, since that's
// what phone cameras read best.
import { computed } from 'vue'
import { qrDrawing } from '@/tv/screen/qr'

const props = defineProps<{ text: string; label: string }>()
const drawing = computed(() => qrDrawing(props.text))
</script>
