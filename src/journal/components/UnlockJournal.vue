<template>
  <section class="flex flex-col gap-3 rounded-xl border border-accent/50 bg-accent/5 p-4" :aria-labelledby="`${uid}-heading`" tabindex="-1" data-testid="journal-locked">
    <div class="flex items-center gap-2">
      <AppIcon name="lock" size="size-5" />
      <h3 :id="`${uid}-heading`" class="font-semibold">{{ m.lockedHeading }}</h3>
    </div>
    <p class="text-sm text-muted">{{ m.lockedIntro }}</p>
    <UnlockForm purpose="unlock" />
    <RouterLink to="/account" class="min-h-11 self-start py-2.5 text-sm underline underline-offset-4">{{ m.forgot }}</RouterLink>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Locking my journal: shown in place of the writing on a device that hasn't unlocked my journal yet.
import { useId } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import UnlockForm from '@/journal/components/UnlockForm.vue'
import { messages } from '@/messages'

const m = messages.journalLock
const uid = useId()
</script>
