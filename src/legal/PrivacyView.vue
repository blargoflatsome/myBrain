<template>
  <main class="legal mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pt-8 md:px-8 pb-16">
    <RouterLink to="/" class="text-sm text-muted underline">← {{ messages.legal.back }}</RouterLink>
    <h1 class="text-2xl font-bold">Privacy policy</h1>
    <p class="text-sm text-muted">Draft · last updated November 13, 2026</p>

    <p>My Brain is a small personal productivity app. This page explains, in plain words, what it keeps about you and who can see it.</p>

    <h2>What we keep</h2>
    <ul>
      <li><strong>From Google sign-in:</strong> your email address, name and profile picture.</li>
      <li><strong>What you give us:</strong> your phone number (used only for events) and your settings.</li>
      <li><strong>What you put in the app:</strong> tasks, habits, routines, journal entries, The Vault, quests, events, tags, reminders and your people.</li>
      <li><strong>For notifications:</strong> a notification address for each device you turn them on for, and your ntfy topic if you use ntfy.</li>
      <li><strong>Messages about events:</strong> a log of invitations, answers, messages and cancellations sent to people (who, how, when, and whether it worked).</li>
      <li><strong>About guests you invite:</strong> the name, email address or phone number you typed, and their answer.</li>
      <li><strong>Your people:</strong> the name, email address or phone number of guests you've invited by email or phone, saved so you can invite them again. Only you can see them; you can edit or remove them on the Account page, and Delete my data removes them.</li>
      <li><strong>Connections:</strong> who you're connected with, connection requests you sent (the email or phone you typed) and received, and anyone you blocked. A request never tells you whether an address belongs to an account.</li>
      <li><strong>Availability:</strong> your weekly and one-off unavailable times. Only your connections can see when you're free or busy, never what your plans are, and you can turn this off.</li>
    </ul>

    <h2>Who can see it</h2>
    <ul>
      <li>Your data is yours. Other users can't see your tasks, journal, Vault, habits, routines, reminders or events.</li>
      <li>If you lock your journal, your writing is encrypted on your device before it's uploaded, so nobody else can read it, including whoever runs My Brain. Only the word count and whether you wrote anything stay readable, for streaks, trophies and reminders. If you lose your passphrase and your recovery key, your writing can't be recovered. The lock can't protect against a harmful update to the app itself, someone using your device while it's unlocked, or the word count and yes/no answer, which stay readable.</li>
      <li>Your connections can see your profile: your name, your Google picture and the trophies you have earned. Trophies never name a habit.</li>
      <li>People you invite to an event see its title, date, time and notes, and who invited them. The host sees each person's answer.</li>
      <li>No one can search for you by name. Typing your email or phone number never tells anyone whether you have an account.</li>
    </ul>

    <h2>Services we use</h2>
    <ul>
      <li><strong>Supabase</strong> stores the data and signs you in. <strong>Netlify</strong> hosts the website and sends phone notifications.</li>
      <li><strong>Google</strong> handles sign-in. If you use voice input, your browser (Chrome) sends the audio to Google to turn it into text.</li>
      <li><strong>Web Push</strong> services (from your browser's maker) deliver notifications. <strong>ntfy.sh</strong> delivers ntfy alerts if you turn them on; anyone who knows your topic can read those alerts.</li>
      <li>We don't sell your data, show ads, or use trackers.</li>
    </ul>

    <h2>Your choices</h2>
    <ul>
      <li><strong>Download my data</strong> on the Account page saves everything you have as one file.</li>
      <li><strong>Lock my journal</strong> on the Account page encrypts your journal writing. You can turn it off again.</li>
      <li><strong>Delete My Account</strong> permanently removes your account and everything in it.</li>
      <li>Guests can use "Stop these emails" in any invitation to stop getting messages about events.</li>
    </ul>

    <h2>Changes and contact</h2>
    <p>If this policy changes, the date at the top changes too. Questions: contact the person who runs this app (contact details to be added).</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §8: privacy policy, in plain language, drafted from how the app actually works. A starting point to review,
// not legal advice.
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
