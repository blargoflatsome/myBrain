<template>
  <!-- Bottom padding keeps the credit clear of the Capture button (and, through #content, the phone tab bar). -->
  <footer class="px-5 pt-4 pb-20 text-center text-sm text-muted md:px-8" data-testid="app-footer">
    {{ m.conceivedBy }}
    <a :href="LINKEDIN" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-6 items-center underline" data-testid="credit-link">{{ m.name }}</a>
    {{ m.year }}
  </footer>
</template>

<script setup lang="ts">
// SPEC §2 Credit: the creator's credit on every page. Keep it (CLAUDE.md "Credit in the footer").
import { messages } from '@/messages'

const LINKEDIN = 'https://www.linkedin.com/in/jordanbuermann/'
const m = messages.footer
</script>
