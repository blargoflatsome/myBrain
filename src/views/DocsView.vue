<template>
  <main class="docs mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-16">
    <RouterLink to="/" class="text-sm text-muted underline">← Back to My Brain</RouterLink>
    <h1 class="text-2xl font-bold">How to use My Brain</h1>
    <p>
      My Brain is built for minds that wander: get a thought out of your head in seconds, and let it come back when it
      matters. The app speaks as "past you", the person who made the plan, so a reminder is a friendly nudge, never a
      telling-off. This guide walks you through getting set up and making the most of each part.
    </p>

    <nav aria-labelledby="docs-contents" class="rounded-2xl border border-line bg-surface p-4">
      <h2 id="docs-contents" class="!mt-0">Contents</h2>
      <ol class="contents">
        <li v-for="s in sections" :key="s.id"><a :href="`#${s.id}`" class="underline">{{ s.title }}</a></li>
      </ol>
    </nav>

    <section id="getting-started" aria-labelledby="getting-started-h">
      <h2 id="getting-started-h">Getting started</h2>
      <ol>
        <li><strong>Sign in with Google.</strong> The first time, you'll be asked for a phone number (used only for events) and how you'd like to hear about invitations.</li>
        <li><strong>Install it.</strong> On an Android phone in Chrome, open the ⋮ menu and choose <em>Install app</em> (or <em>Add to Home screen</em>). On a computer, use the install icon at the right of the address bar. Installed, it opens like any app and works offline.</li>
        <li><strong>Turn on reminders.</strong> Go to <em>Account → Reminders</em> and switch on <em>Notifications on this device</em>, once on each device. Press <em>Send a test</em> to check. Set <em>Quiet hours</em> if you don't want ordinary reminders at night.</li>
        <li><strong>Look around the Dashboard.</strong> It's the first page you see and shows everything at a glance.</li>
      </ol>
    </section>

    <section id="daily-rhythm" aria-labelledby="daily-rhythm-h">
      <h2 id="daily-rhythm-h">A simple daily rhythm</h2>
      <ul>
        <li><strong>Morning:</strong> open the Dashboard. Check your Post Its, how yesterday went and today's notifications, then glance at <em>Tasks</em> and <em>Habits</em>.</li>
        <li><strong>All day:</strong> whenever something pops into your head, press <em>+ Capture</em>. Don't sort it now; "Decide later" is fine.</li>
        <li><strong>Need to focus?</strong> Start the <em>Focus timer</em> from the menu.</li>
        <li><strong>Evening:</strong> open the <em>Journal</em>, answer "Was today better than yesterday?", write a little, and note how to make tomorrow better. Add tomorrow's tasks with <em>+ Capture</em>.</li>
      </ul>
    </section>

    <section id="capture" aria-labelledby="capture-h">
      <h2 id="capture-h">Capture</h2>
      <ul>
        <li>Press <em>+ Capture</em> (bottom right of every page). Pick what it is: <em>Task</em>, <em>The Vault</em>, <em>Quest</em>, <em>Habit</em>, <em>Post It</em> or <em>Decide later</em>. Only the title is needed.</li>
        <li>Press the 🎙 microphone button to speak instead of typing (where your browser supports it).</li>
        <li>From another app, use <em>Share → My Brain</em> to send text or a link straight into Capture.</li>
        <li><em>Decide later</em> puts the thought in <strong>Orphans</strong> (in the menu). Sort it into a task, quest or Vault item when you have a minute.</li>
        <li>No connection? Capture anyway. It's saved on your device and syncs when you're back online.</li>
      </ul>
    </section>

    <section id="tasks" aria-labelledby="tasks-h">
      <h2 id="tasks-h">Tasks and priority tasks</h2>
      <ul>
        <li>The <em>Tasks</em> page has three tabs: the day's list, <em>Undated</em> and <em>Priority</em>. Use the arrows to look at other days.</li>
        <li>Give a task a priority (Low, Medium, High) and it's sorted for you. Check it off when it's done.</li>
        <li>Anything not done today carries over to tomorrow. If a task carries over twice, it offers <em>Cancel</em> and <em>Edit</em> so you can decide what to do with it.</li>
        <li>No date? It waits in <em>Undated</em> until you give it one.</li>
        <li><strong>Priority tasks</strong> (the <em>Priority</em> tab) are for must-dos like medication. At their time, a full-screen reminder appears that you slide to complete, or snooze.</li>
      </ul>
    </section>

    <section id="habits" aria-labelledby="habits-h">
      <h2 id="habits-h">Habits</h2>
      <ul>
        <li>On <em>Habits</em>, press <em>+ New habit</em>. Choose when it <strong>starts</strong> and <strong>how often</strong>: every week, every 2 weeks, or every month on the start date's day. For weekly habits, pick the days.</li>
        <li>Add a <strong>reminder time</strong>, and optionally a <strong>timer</strong>: with a reminder at 8:00 am and a 2-hour timer, the habit is due by 10:00 am. Without a timer it's due by midnight.</li>
        <li>Every day you complete it grows the streak; a missed day starts it again. Your <strong>best streak</strong> is kept so you have something to beat.</li>
        <li><strong>Example, alternating chores:</strong> make <em>Recycling</em> start on a Thursday, every 2 weeks, Thursday only, reminder 3:00 pm. Make <em>Trash</em> the same but starting the next Thursday. They take turns every week.</li>
        <li>Mark a habit <strong>private</strong> and it's never shown to anyone. Mark it <strong>priority</strong> for a full-screen reminder.</li>
      </ul>
    </section>

    <section id="routines" aria-labelledby="routines-h">
      <h2 id="routines-h">Routines</h2>
      <ul>
        <li>On <em>Routines</em>, press <em>+ New routine</em>, add steps, and set the days and a reminder, or make it a routine you run anytime.</li>
        <li>Add a habit as a step and doing the step completes the habit too.</li>
        <li>Put the steps in order by dragging the ⠿ handle, tapping it for <em>Move up</em> / <em>Move down</em>, or using the arrow keys.</li>
        <li>Press <em>Start</em> to go through it one step at a time: <em>Completed</em> or <em>Skip</em>. The page shows how often you finish each routine.</li>
      </ul>
    </section>

    <section id="journal" aria-labelledby="journal-h">
      <h2 id="journal-h">Journal</h2>
      <ul>
        <li>Today's stats (tasks, habits, routines, priority tasks, streaks and quests) are filled in for you.</li>
        <li>Answer <strong>Was today better than yesterday?</strong> A run of Yes answers counts up as "Days since your worst day" on the Dashboard.</li>
        <li>Write in <strong>Tell me about it</strong> with bold, lists, checklists and links; ⤢ opens it full screen. Then note <strong>How to make tomorrow better?</strong></li>
        <li>It saves as you type. The status by the heading and under each box says <em>Saving…</em>, <em>Saved</em>, or <em>Saved on this device</em> when you're offline.</li>
        <li>Forgot a day? If you did something that day, an entry is written for you. Every earlier entry can be edited; they're shown 3 days per page.</li>
      </ul>
    </section>

    <section id="calendar" aria-labelledby="calendar-h">
      <h2 id="calendar-h">Calendar and inviting people</h2>
      <ul>
        <li>On <em>Calendar</em>, press <em>+ New event</em> or tap a day or time. A new event starts at the next whole hour; tick <em>All day</em> if it doesn't have a time.</li>
        <li>Choose how it repeats (every day, weekdays, every week, every 2 weeks, every month, every year) and when to be reminded.</li>
        <li><strong>Invite people</strong> under <em>People</em>: find someone on My Brain by name, or add an email address or phone number. On a phone you can <em>Pick from contacts</em>: pick one person and their details fill the boxes, ready for <em>Add</em>; pick several and they're all added at once. On some phones Chrome then shows a <em>Share contacts</em> list: tap each person so a check appears, then <em>Done</em>. If the contact doesn't come back, My Brain says so, and you can type their email or phone number instead. People you've invited before are suggested as you type.</li>
        <li><strong>Share a contact into My Brain</strong> (works even when <em>Pick from contacts</em> doesn't): in your phone's Contacts app, open the person, tap <em>Share</em>, choose the contact file (vCard or VCF), then choose <em>My Brain</em>. Pick one of your upcoming events, or <em>New event</em>, and they appear under <em>To invite (when you save)</em>. You can share several contacts at once. Only their name, email and phone number are used, and nothing is sent until you save the event.</li>
        <li>Press <em>Save</em>, and a window helps you send each invitation from your messaging or email app, one person at a time. Guests answer Yes, Maybe or No from their private link, no account needed, and can add the event to their own calendar.</li>
        <li>When you pick a time, friends on My Brain who share their availability show as free or busy, with suggested times when everyone's free. Set your own unavailable times on the Account page.</li>
        <li>Plans changed? <em>Cancel and notify</em> lets everyone know, with a personal message.</li>
      </ul>
    </section>

    <section id="vault" aria-labelledby="vault-h">
      <h2 id="vault-h">The Vault</h2>
      <ul>
        <li>Buckets hold things worth remembering that aren't tasks: restaurants, books, places to go, gift ideas, a shopping list.</li>
        <li>Open a bucket and type in the box to add something. Open an item to add a star rating, notes, and a link or address (addresses open in maps).</li>
        <li>In <em>Bucket settings</em>, make a bucket a checklist (great for shopping); <em>Clear checked</em> tidies it up.</li>
        <li>Press ☆ to <strong>star</strong> a bucket: starred buckets are listed first and get a card on the Dashboard with their newest items.</li>
      </ul>
    </section>

    <section id="more" aria-labelledby="more-h">
      <h2 id="more-h">Quests, Post Its and the Focus timer</h2>
      <ul>
        <li><strong>Random Quest:</strong> add projects you'd love to do someday through Capture. When you're bored, choose your energy and time and press <em>Pick a quest for me</em>. Choose <em>I'll do it</em>, <em>Re-roll</em>, or <em>Mark done</em>.</li>
        <li><strong>Post Its:</strong> capture a Post It, pick a color, and it's taped to the top of your Dashboard. Swipe or use the arrows to flip through them, ✎ to edit, ✕ to take one down (with Undo).</li>
        <li><strong>Focus timer:</strong> choose <em>Focus timer</em> in the menu. Work for 25 minutes, break for 5, and every fourth break is 15. <em>Minimize</em> it to a pill in the bottom-left corner to keep it running while you do other things; tap the pill to bring it back; ✕ stops it.</li>
      </ul>
    </section>

    <section id="tags" aria-labelledby="tags-h">
      <h2 id="tags-h">Search and tags</h2>
      <ul>
        <li>Open <em>Search</em> (in the menu, or ⌕ at the top on a phone) and type. It searches tasks, habits, routines, the journal, the Vault, quests and events instantly, even offline.</li>
        <li><strong>Tags</strong> go on tasks, habits and routines. Open one, type a tag in <em>Tags</em> and press Enter. Tags you've used before are suggested.</li>
      </ul>
      <h3>Example: keeping Work and Personal apart</h3>
      <p>Tags let one app hold your whole life without everything blurring together. Here's one way to split work from home.</p>
      <ol>
        <li><strong>Pick two tags</strong>, for example <code>work</code> and <code>personal</code>.</li>
        <li>
          <strong>Tag as you go.</strong> When you edit a task, habit or routine, add the tag that fits:
          <ul>
            <li>Task "Send the Q3 report" → <code>work</code></li>
            <li>Task "Book the dentist" → <code>personal</code></li>
            <li>Habit "Gym" → <code>personal</code></li>
            <li>Routine "Start-of-day planning" → <code>work</code></li>
          </ul>
        </li>
        <li><strong>See only work.</strong> Open Search and tap <code>#work</code> without typing anything. Everything tagged work is listed, and nothing else.</li>
        <li><strong>Narrow it down.</strong> Keep <code>#work</code> chosen and type a word, such as "report", to find only work things that mention it.</li>
        <li><strong>Switch to home mode.</strong> Tap <code>#work</code> again to turn it off, and tap <code>#personal</code> instead.</li>
        <li><strong>Go further.</strong> Choosing two tags finds things with both, so <code>#work</code> plus <code>#urgent</code> shows only urgent work.</li>
      </ol>
      <p>Tip: keep tags short and few. Two or three you use every day are worth more than twenty you forget about.</p>
    </section>

    <section id="dashboard" aria-labelledby="dashboard-h">
      <h2 id="dashboard-h">The Dashboard and notifications</h2>
      <ul>
        <li>The Dashboard shows your Post Its, <em>How past you did yesterday</em>, <em>Today's notifications</em>, habit streaks, journal runs, favorite buckets and event stats. Use <em>Period</em> to change the stats' time range.</li>
        <li><strong>Missed a notification?</strong> Every reminder and invitation update from today is listed in <em>Today's notifications</em>. Tap one to open it, ✕ to clear it, or <em>Clear all</em>. They clear themselves at midnight.</li>
        <li>Want a louder backup for priority reminders? Turn on <em>Also send to the ntfy app</em> on the Account page.</li>
      </ul>
    </section>

    <section id="your-data" aria-labelledby="your-data-h">
      <h2 id="your-data-h">Your data and account</h2>
      <ul>
        <li>Everything syncs across your devices. The small status (Synced, Syncing…, Offline) shows where things stand.</li>
        <li>On the Account page: <em>Download my data</em> saves everything as one file; <em>Delete my data</em> lets you choose what to clear and start fresh; <em>Delete My Account</em> removes everything for good.</li>
        <li>My Brain works with a keyboard and screen readers: press Tab first on any page for <em>Skip to content</em>.</li>
      </ul>
      <p>
        See the <RouterLink to="/features" class="underline">feature overview</RouterLink>,
        the <RouterLink to="/privacy" class="underline">privacy policy</RouterLink> and the
        <RouterLink to="/terms" class="underline">terms of service</RouterLink>.
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Features and Docs pages: how to use My Brain, for new users. Keep it in step with the app: every added,
// changed or removed feature updates this page and FeaturesView.vue.
import { RouterLink } from 'vue-router'

const sections = [
  { id: 'getting-started', title: 'Getting started' },
  { id: 'daily-rhythm', title: 'A simple daily rhythm' },
  { id: 'capture', title: 'Capture' },
  { id: 'tasks', title: 'Tasks and priority tasks' },
  { id: 'habits', title: 'Habits' },
  { id: 'routines', title: 'Routines' },
  { id: 'journal', title: 'Journal' },
  { id: 'calendar', title: 'Calendar and inviting people' },
  { id: 'vault', title: 'The Vault' },
  { id: 'more', title: 'Quests, Post Its and the Focus timer' },
  { id: 'tags', title: 'Search and tags (Work and Personal example)' },
  { id: 'dashboard', title: 'The Dashboard and notifications' },
  { id: 'your-data', title: 'Your data and account' },
]
</script>

<style scoped>
.docs h2 {
  margin-top: 1rem;
  font-size: 1.25rem;
  font-weight: 600;
}
.docs h3 {
  margin-top: 0.75rem;
  font-weight: 600;
}
.docs section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  scroll-margin-top: 1rem;
}
.docs ul {
  list-style: disc;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.docs ol {
  list-style: decimal;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.docs code {
  border-radius: 0.375rem;
  background: var(--bg);
  border: 1px solid var(--line);
  padding: 0 0.3rem;
}
</style>
