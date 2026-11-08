<template>
  <main class="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pt-8 pb-16">
    <header class="flex flex-col gap-4">
      <p class="text-sm font-semibold tracking-wide text-muted uppercase">My Brain</p>
      <h1 class="text-3xl font-bold sm:text-4xl">A second brain for busy, wandering minds</h1>
      <p class="max-w-2xl text-lg text-muted">
        Catch a thought in seconds, then let it come back at the right moment. My Brain keeps your tasks, habits,
        routines, journal, plans and ideas in one calm place, and reminds you in the voice of "past you", the
        version of you who made the plan, so nothing is ever your fault.
      </p>
      <div class="flex flex-wrap gap-3">
        <RouterLink to="/sign-in" class="flex min-h-12 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink">Get started free</RouterLink>
        <RouterLink to="/docs" class="flex min-h-12 items-center rounded-xl border border-line px-5 font-medium">How it works</RouterLink>
      </div>
    </header>

    <section v-for="group in groups" :key="group.heading" class="flex flex-col gap-4" :aria-labelledby="slug(group.heading)">
      <h2 :id="slug(group.heading)" class="text-xl font-semibold">{{ group.heading }}</h2>
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="f in group.features" :key="f.title" class="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4" data-testid="feature">
          <h3 class="font-semibold"><span aria-hidden="true">{{ f.icon }} </span>{{ f.title }}</h3>
          <p class="text-sm text-muted">{{ f.text }}</p>
        </li>
      </ul>
    </section>

    <footer class="flex flex-col items-start gap-4 border-t border-line pt-6">
      <p class="text-lg font-semibold">Ready to let past you help out?</p>
      <RouterLink to="/sign-in" class="flex min-h-12 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink">Sign in with Google</RouterLink>
      <p class="flex flex-wrap gap-4 text-sm">
        <RouterLink to="/docs" class="text-muted underline">How to use My Brain</RouterLink>
        <RouterLink to="/privacy" class="text-muted underline">Privacy policy</RouterLink>
        <RouterLink to="/terms" class="text-muted underline">Terms of service</RouterLink>
      </p>
    </footer>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Features and Docs pages: a public page that sells My Brain to new people, with a short summary of every
// feature. Keep it in step with the app: every added, changed or removed feature updates this page and DocsView.vue.
import { RouterLink } from 'vue-router'

interface Feature {
  icon: string
  title: string
  text: string
}

const groups: { heading: string; features: Feature[] }[] = [
  {
    heading: 'Get it out of your head',
    features: [
      { icon: '➕', title: 'Quick capture', text: 'One button on every page. Choose Task, The Vault, Quest, Habit, Post It or Decide later, type or speak it, and get back to what you were doing. Works offline, and you can share text into it from other apps.' },
      { icon: '🧺', title: 'Orphans', text: 'Not sure where a thought goes? "Decide later" parks it in Orphans until you have a minute to sort it into a task, a quest or the Vault.' },
      { icon: '🟨', title: 'Post Its', text: 'Sticky notes taped to the top of your Dashboard for quick reminders and scratch ideas. Flip through the stack, edit in place, and peel them off when you’re done.' },
    ],
  },
  {
    heading: 'Get things done',
    features: [
      { icon: '✅', title: 'Tasks', text: 'Today’s list, sorted High, Medium, Low. Unfinished tasks roll over to tomorrow, undated ones wait in their own list, and anything that keeps slipping asks you to decide.' },
      { icon: '⚠️', title: 'Priority tasks', text: 'For the things that can’t be missed, like medication: a full-screen reminder you slide to complete, with snooze, on the days you choose.' },
      { icon: '🎯', title: 'Focus timer', text: 'A full-screen Pomodoro timer: 25 minutes of work, then a break. Minimize it to a small pill and it keeps going while you use the app or other apps.' },
      { icon: '🎲', title: 'Random Quest', text: 'Bored? Tell it how much energy and time you have, and it picks a project from your bucket list, never the same few over and over.' },
    ],
  },
  {
    heading: 'Build habits and routines',
    features: [
      { icon: '🔥', title: 'Habits and streaks', text: 'Track streaks and beat your best. Pick the start day and repeat every week, every 2 weeks or every month, with a reminder and a time window. Keep any habit private.' },
      { icon: '🧭', title: 'Routines', text: 'Morning, evening or anytime routines shown one step at a time, with habits as steps and completion stats so you can see how you’re doing.' },
      { icon: '📓', title: 'Journal', text: 'An end-of-day check-in with the day’s stats filled in for you. Write with formatting, answer "Was today better than yesterday?", and plan how to make tomorrow better. Saves as you type.' },
    ],
  },
  {
    heading: 'Plan with other people',
    features: [
      { icon: '📅', title: 'Calendar', text: 'Month, week and day views with your events, dated tasks and priority tasks together. Events repeat daily, weekly, every 2 weeks, monthly or yearly, with reminders.' },
      { icon: '✉️', title: 'Invitations', text: 'Invite people by email or phone. Guests answer from a private link without an account, and you can let everyone know if plans change.' },
      { icon: '🤝', title: 'Connections', text: 'Connect with people you know by their email or phone number. No one can find you unless they already know how to reach you. Connections get your invitations right in their app.' },
      { icon: '🙋', title: 'Your people', text: 'Type a guest’s email or phone once. When you save the event they join your people, so next time you pick them from your Contacts. You can also add people ahead of time from your Account page.' },
    ],
  },
  {
    heading: 'Remember everything else',
    features: [
      { icon: '🗃️', title: 'The Vault', text: 'Buckets for restaurants, books, places to go, shopping lists, anything. Add ratings, links and addresses that open in maps, turn a bucket into a checklist, and star favorites onto your Dashboard.' },
      { icon: '🔎', title: 'Search and tags', text: 'Instant search across tasks, habits, routines, the journal, the Vault, quests and events. Tag tasks, habits and routines to slice everything by context, like Work and Personal.' },
    ],
  },
  {
    heading: 'See it all at a glance',
    features: [
      { icon: '📊', title: 'Dashboard', text: 'Your Post Its, how yesterday went, today’s notifications, habit streaks, journal runs, days since your worst day, favorite Vault buckets and event stats, all on one page.' },
      { icon: '🔔', title: 'Reminders that reach you', text: 'Notifications on your phone and computer, or through the ntfy app, with quiet hours and snooze. Missed one? Today’s notifications are listed on your Dashboard.' },
    ],
  },
  {
    heading: 'Yours, everywhere',
    features: [
      { icon: '📱', title: 'Works on every device', text: 'Install it on your phone or computer like an app. It works offline and syncs everything across your devices when you’re back online.' },
      { icon: '🔒', title: 'Private by design', text: 'Your data is yours: no ads, no trackers, no selling. Download it all or delete it any time, and protected by strict security from day one.' },
      { icon: '♿', title: 'Made for everyone', text: 'Built to WCAG 2.2 AA accessibility, with full keyboard and screen reader support, light and dark mode, and calm, readable design.' },
    ],
  },
]

const slug = (text: string) => `features-${text.toLowerCase().replace(/[^a-z]+/g, '-')}`
</script>
