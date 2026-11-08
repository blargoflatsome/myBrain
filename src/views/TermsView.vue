<template>
  <main class="legal mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-16">
    <RouterLink to="/" class="text-sm text-muted underline">← {{ messages.legal.back }}</RouterLink>
    <h1 class="text-2xl font-bold">Terms of service</h1>
    <p class="text-sm text-muted">Draft · last updated November 7, 2026</p>

    <p>My Brain is a free personal project. By using it you agree to these terms.</p>

    <h2>Using My Brain</h2>
    <ul>
      <li>Use it for your own planning, and to invite people who would want to hear from you.</li>
      <li>Don't use it to spam, harass or mislead anyone, or to message people who asked you not to.</li>
      <li>Only invite people whose contact details you're allowed to use. Invitations and messages are limited to keep things friendly.</li>
      <li>Keep your Google account safe; anything done while signed in counts as you.</li>
    </ul>

    <h2>Reminders are a helper, not a guarantee</h2>
    <p>Notifications can arrive late or not at all (for example when a phone is saving battery). Don't rely on My Brain alone for anything critical, such as medication.</p>

    <h2>Your content</h2>
    <p>What you put in My Brain stays yours. You can download it or delete your account at any time from the Account page.</p>

    <h2>No warranty</h2>
    <p>My Brain is provided as it is, without guarantees that it will always be available, error-free, or keep every piece of data. To the extent the law allows, the people who run it aren't liable for losses from using it.</p>

    <h2>Changes</h2>
    <p>These terms may change; the date at the top shows the latest version. Accounts that break these terms may be removed.</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §8: terms of service, in plain language. A starting point to review, not legal advice.
import { RouterLink } from 'vue-router'
import { messages } from '@/messages'
</script>

<style scoped>
.legal h2 {
  margin-top: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
}
.legal ul {
  list-style: disc;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
