# Project Instructions: My Brain

Hand this document to Claude Code as the project brief. It describes what to build, the chosen stack, the rules for each feature, and the order to build in.

## 1. Overview

My Brain is an app where you store everything you need to remember. It is a personal productivity and "boredom buster" app that I can reach from anywhere (Android phone, laptop, desktop, and a dedicated Raspberry Pi touch screen). Its most important job is **instant capture**: whenever I have a thought, I can record it in a couple of taps, even offline.

### How to work: spec-driven development

This project is built **spec-first**. This document is the spec, and it is the source of truth for what to build. Follow these rules for the whole project:
- **Read first.** Start every session by reading `CLAUDE.md`, `docs/SPEC.md`, and `PROGRESS.md`. Read the whole spec before writing code.
- **The repo copy is the source of truth.** Save this document in the repository as `docs/SPEC.md`, and keep `CLAUDE.md` short, with the key rules and the build and test commands, pointing to the spec. Once it is in the repo, update that copy, not any other.
- **Keep the spec updated.** When a decision changes, a requirement is clarified, or something is built differently than written, update `docs/SPEC.md` in the same change as the code. Never let the code and the spec disagree silently.
- **Spec first for changes.** When I ask for something new or different, say which parts of the spec will change and get my OK. Update the spec, then build it.
- **Don't guess.** If the spec is silent or unclear, ask me, then write the answer into the spec. When an open question in section 12 is answered, move the answer into the section it belongs to and remove the question.
- **Check against the spec.** Before calling a build step done, compare the work to the spec sections it covers. Name each Vitest and Playwright test after the rule it proves, and tell me about any rule that has no test yet.
- **Track progress.** Keep `PROGRESS.md` current: what is done, what is in progress, what is next, linked to spec sections and build steps. End each session by updating it.
- **Log decisions.** Record significant decisions, and changes of mind, with the reason in a short decisions list in `docs/SPEC.md`.
- **Keep the spec concise.** It holds rules and decisions, not code. Flag contradictions in the spec, or conflicts with current platform limits, instead of working around them silently.

It combines a daily checklist (routines, habits, tasks, priority tasks), a journal, "The Vault" for things to remember, a calendar/reminders view, a dashboard, and a Random Quest picker that chooses a project from my bucket list when I'm bored. Tasks are presented in the voice of "past you" (for example, "Past you left you this one").

## 2. Guiding principles
1. **Capture first.** Quick capture must be the fastest thing in the app. It asks where the thought goes: task, vault item, or quest.
1. **Works offline.** Capturing and checking things off must work with no connection and sync later.
1. **Multi-user ready.** I am the only user at first, but the app may become public someday. Every record belongs to a user and is protected by row-level security from day one.
1. **Free and open source.** Prefer free tiers and open source tools. Avoid paid or proprietary dependencies unless noted.
1. **Simple and documented.** Prefer simple, mainstream choices. Make small commits, keep a README that explains setup and key decisions, and explain notable trade-offs as you go.

1. **Confirm before impact.** Any button that affects other users (cancelling or declining an event, sending messages to others) or removes data (deleting tasks, habits, entries, or an account) first shows a confirmation that says what will happen and who is affected. Routine actions like checking off a task or a quick capture do not need one.

### Voice and tone: "past you"
- The whole app speaks to the user in one consistent voice: it reminds them of what **past them** established. Nothing is ever the current user's fault. Past you made the plan, and present you gets to decide what to do about it. The tone is friendly and light, never scolding or guilt-inducing.
- Every message that asks the user to do something, or tells them something was missed, follows the same pattern: past you, what they established, then a gentle question or invitation.
- This applies everywhere the app speaks to the user: in-app text, empty states, push notifications, ntfy messages, emails, texts to the user, and the Dashboard.
- Style examples (a guide for the voice, not a fixed list):
   - "Reminder: Past you asked that you journal today."
   - "Past you didn't check in yesterday. Would you like to do it now?"
   - "Past you agreed to this event. Are you going to go?"

- Write the rest of the messages in this same style for tasks, carried-over tasks, habits, routines, priority tasks, streaks, achievements, and event invitations and RSVPs. Keep all message wording in one place (a single file or table) so the voice is easy to adjust. Draft them and show me before finalizing.
- "Past you" only speaks to the user about themselves. Messages sent to other people, such as the standard cancellation text to guests and invitees, are written normally from the user to them.

## 3. Tech stack
- **Visual style:** calm, soft neutral colors with one accent color; light or dark following the device's system setting.
- **Front end:** Vue 3 (Composition API) with Vite, Vue Router, and Pinia. Use TypeScript throughout (front end and server functions) and Tailwind CSS for styling, mobile-first so it also works on the 10 inch touch display.
- **PWA:** installable on Android, with a service worker (for example vite-plugin-pwa / Workbox), a web app manifest, home-screen shortcuts for quick capture, and Web Share Target so I can share text from other apps into the capture screen.
- **Backend/data:** Supabase (open source; hosted free tier): Postgres, Google sign-in, row-level security, and Realtime for syncing across devices.
- **Server-side Node code:** Netlify Functions (including scheduled functions) for anything that must run on a server, such as sending push notifications. Verify current Netlify and Supabase free-tier limits before relying on them.
- **Offline storage:** IndexedDB (for example Dexie) with a queue of pending changes that syncs when online.
- **Calendar view:** an open source Vue calendar library (for example FullCalendar).
- **Notifications:** both built-in Web Push (VAPID) and ntfy (open source push; HTTP publish to a topic). I want to be able to receive reminders either way.
- **Hosting/deploy:** GitHub repository, auto-deployed to Netlify. Database schema lives in the repo as Supabase migrations.

### Testing, quality, and workflow
- Use **Vitest** for unit and integration tests and **Playwright** for end-to-end tests in a real browser (including a phone-sized screen and, where possible, offline and installed-PWA behavior).
- **Prove it works.** Claude Code must use Vitest and Playwright to show that its code works: write tests for each feature as it is built, run the full test suite before calling any step done, and run it again after every change so new work doesn't break old behavior. Fix any regression before moving on, and tell me what was tested.
- Time-dependent logic (midnight rollover, carry-over, streaks, expired habit timers, timezones, daylight saving changes) must be tested with a mocked clock.
- GitHub Actions runs linting, type checking, Vitest, and Playwright on every pull request. Netlify deploy previews are used for branches, and the main branch is production. **Merge to main once per build step** (one production deploy per step), because the Netlify free plan allows only about 20 production deploys a month (see Decisions). Work happens on a branch per step, tried out through its deploy preview.
- Use two Supabase projects, one for development and one for production (verify the free tier allows this), with migrations stored in the repo.
- Keep a `PROGRESS.md` (what is done, what is next, and decisions made) and update it at the end of each session. Also create a short `CLAUDE.md` with the key rules and the build and test commands, pointing back to this document.

## 4. Data model (all tables have `id`, `user_id`, `created_at`, `updated_at`, and deleted_at (soft delete, so deletions sync to other devices), with row-level security so users only access their own rows. updated_at is set by the server, not the device clock)
- **profiles:** timezone, display settings, notification preferences (ntfy topic, quiet hours, default snooze length), email, phone number (both required at signup), preferred event notification method (email, text, or both), display name, avatar, short bio, and a visibility setting for who can see my streaks (private by default).
- **tasks:** title, notes, due date, priority, status (open, done, cancelled), completed_at, carry_over_count, source (manual, capture, journal).
- **habits:** title, notify time, timer duration (how long I have to complete it; an expired timer counts as a miss), cached current streak and best streak (the source of truth is habit_logs, so streaks can always be recalculated), is_private (hidden from my Profile and from all other users).
- **habit_logs:** habit id, date, status (completed or missed), completed_at (so history and streaks can be recalculated and stats survive).
- **routines:** title, notify time, ordered list of steps.
- **routine_steps:** routine id, position, title.
- **routine_runs / routine_step_logs:** per day, which steps were completed or skipped, for completion stats.
- **priority_tasks:** title, description, reminder time, recurrence, status. Example: take meds.
- **journal_entries:** date, body text, auto-generated stats snapshot for that day.
- **vault_buckets / vault_items:** user-defined buckets (restaurant reviews, places to go, books, shows, ideas to research, shopping list) and the items inside them.
- **quests:** title, details, estimated time, energy level, status, last_picked_at, times_picked.
- **reminders / events:** title, start, end, recurrence, notify offset (calendar items).
- **dashboard_config:** which blocks are shown and their positions, per device or layout name.
- **inbox (capture queue):** raw captured text that hasn't been filed yet, used when I choose Decide later, or when a capture is saved before its destination is chosen.

- **events (additions):** status (active or cancelled), cancelled_at.
- **event_attendees:** event id, user id (for app users) or guest name, email and phone number, role (creator or invitee), RSVP status (pending, accepted, maybe, declined, cancelled), and a secure token for guest RSVP links.
- **message_templates:** user id, type (for example attendee_cancel, event_cancel, and others), body with {{variable}} placeholders. Each user can customize their templates; app defaults are used when none is set.
- **sent_messages:** event id, attendee id, message text, status, sent_at.

- **availability_rules:** user id, weekday, start and end time, available or unavailable. **availability_exceptions:** user id, date range, available or unavailable, note.
- **external_calendar_links:** user id, provider (Google), encrypted tokens (server-side only), sync settings, sync token, and a mapping between event ids and Google event ids.

- **push_subscriptions:** user id, device label, push endpoint and keys, last_seen. One per device (phone, laptop, Pi); remove subscriptions that the push service reports as invalid.
- **device_pairings:** user id, device name, limited device token (stored hashed), permissions, created_at, revoked_at. Used for the Pi display (see section 9).
- **tags / item_tags:** user-defined tags that can be attached to tasks, vault items, journal entries, and quests.
- **Search index:** a Postgres full-text search index covering tasks, journal entries, vault items, quests, and events (see Global search and tags).

## 5. Phase 1 features and rules

### Quick capture
- One-tap access from the home screen shortcut and a persistent button in the app.
- Type or paste text, then choose the destination each time: **Task**, **The Vault** (with bucket picker), or **Quest**.
- Choosing Task offers an optional date. It never blocks saving: left blank, the task goes to the Undated list.
- Works offline; items are queued and synced later.

- A fourth option, **Decide later**, saves the text to the inbox so I can sort it when I have time.
- A microphone button fills in the text using the device's speech recognition (free; verify browser support). Accepted: on Chrome this sends the audio to Google's servers for transcription. Hide the button where the browser has no speech recognition.
- Any item can later be converted to another type, for example a vault item into a task.

### Tasks
- Daily list, plus the ability to schedule tasks for future days.
- An Undated list holds tasks with no due date. Undated tasks never carry over; giving one a date moves it onto that day's list.
- Completing a task crosses it off.
- The day ends at **midnight in my timezone**. A task not completed by then carries over to the next day, shown in **red text**.
- If it carries over a second time, show **Cancel** and **Edit** buttons so I can make it easier or remove it.
- Priority levels change how the task is rendered (for example emphasis, order, color).
- Present tasks in the "past you" voice.

- Carry-over is calculated from each task's due date and today's date in my timezone when the list is displayed (and by a server-side job for notifications), not by a counter that only runs while the app is open. It stays correct when the app was closed or offline, or when I travel across timezones. `carry_over_count` is derived the same way. Test daylight saving changes and timezone changes.

### Habits
- Fields: title, notify time, timer (time window to complete).
- Track a days-in-a-row streak. A missed day resets it to zero, and the app keeps my **best streak** as the new goal to beat. Current and best streaks are shown on my Profile page (see the Profile page section below).

- The Habits page displays this tag line, worded exactly: "You are only ever truly in competition with past you." It reinforces the "past you" voice and keeps the focus on beating my own best streak.

- When creating or editing a habit, I can mark it **private**. A private habit never appears on my Profile page, in comparisons or leaderboards, or in any badge or achievement shown to others, and other users cannot tell it exists. Enforce this in the database (row-level security and the restricted view), not just in the interface. Habits are not private by default, but nothing is shared with anyone until my profile visibility setting allows it.

- **Timer:** if the timer expires before I complete the habit, it counts as a **miss**. The habit is logged as missed for that day and the streak resets to zero, while my best streak is kept.

### Profile page
- Every user has a Profile page with a display name, avatar, and short bio.
- The page shows each habit's **current streak** and **best streak**, plus overall highlights such as my longest streak ever, so I can feel proud of them.
- Streaks are meant to create accountability and friendly competition between users, so the page can be viewed by other users I choose to share it with.
- **Privacy comes first.** Streaks are private by default, and I can choose who sees them (only me, people I approve, or everyone). Other users must only ever see the streak numbers and habit titles I choose to share, never my tasks, journal, vault, reminders, or events. Enforce this with row-level security and a restricted view, not just in the user interface.
- Habits marked private (see Habits) never appear on my Profile page, and other users cannot tell they exist, for example anything personal like meds.
- Phase 1 builds the Profile page for myself, with the visibility setting in place. Following other users, comparing streaks, and leaderboards are Phase 2 (see section 10).

### Routines (chained tasks)
- A routine is an ordered series of steps with a notify time.
- Completing a step shows the next step.
- Track how often I complete the routine overall, and how often I complete each step versus how many times it was possible.

- **Example routine, Daily Morning Routine:** "Wake up by 7am" → "Brush teeth" → "Shower" → "Skin care" → "Take medication".
- **Phone notifications exist to get me into the app.** A routine's notification fires at its notify time, and tapping it opens My Brain straight to the routine in progress. Don't depend on action buttons inside the notification. Once the app is open, the app handles displaying and advancing the routine steps.
- In the app, each step shows **Skip** and **Completed** buttons. Pressing either one shows the next step in the routine.
- **Skip:** the step simply moves on to the next one, with no animation. The step is recorded as skipped.
- **Completed:** the current step plays a cross-out (strikethrough) animation, then clears and the next step appears. The step is recorded as completed.
- Skipped steps still count as possible steps in the completion stats, so the stats compare completed steps against all the times each step could have been done.

### Priority tasks
- Reminder time, title, description.
- Full-screen reminder that must be marked complete with a **slider**.
- In the PWA, build the best version possible: a full-screen in-app overlay plus persistent, repeating notifications until completed. Note the limits of what a browser can do; a Capacitor Android wrapper in Phase 2 can provide a true full-screen alert.

- Medication-style reminders matter, so don't rely on the PWA alone. Android battery saving can delay web notifications. Also send an ntfy notification at urgent priority as a backup (verify whether the ntfy Android app can break through Do Not Disturb), show a short in-app notice that reminders may be delayed and shouldn't be the only safeguard for critical medication, and build the Capacitor Android wrapper earlier if reliability falls short.
- Quiet hours never silence priority tasks unless I choose that.

### Journal
- End-of-day check-in: write how the day went and create new tasks.
- The day's stats (tasks done, habits kept, routine completion) are added to the entry automatically.

### The Vault
- User-defined buckets of things to remember that are not tasks (restaurant reviews, places to go, books, shows, ideas to research, shopping list).
- New accounts start with three buckets: Shopping list, Restaurant reviews, and Places to go. They can be renamed or deleted like any other bucket.

### Global search and tags
- A search box reachable from every screen searches tasks, journal entries, vault items, quests, and events. Results show what type each item is, and tapping one opens it. Use Postgres full-text search, and make search work on the locally stored copy too, so it works offline if that is practical.
- Tags can be added to tasks, vault items, journal entries, and quests, and results can be filtered by tag.
- Search only ever covers my own data.

### Random Quest (boredom buster)
- A bucket of projects I want to do, each with details, estimated time, and energy level.
- The pick is random but **skips recently picked quests** and can be **filtered by time and energy available**.
- Display the chosen quest's full details, with buttons to accept, re-roll, or mark done.

### Calendar and reminders
- Standard calendar view (month, week, day) similar to Outlook, with reminders and notifications.

- Everything below from Accounts and contact info through Google Calendar sync is built after the Dashboard and Pi display (see the build order). Only the basic calendar view is built earlier.

### Accounts and contact info
- At signup, every user provides an email address and a phone number. Google sign-in supplies the email; the phone number is entered in a short profile step. Phone numbers start as unverified, because verifying them needs an SMS service; decide that together with the SMS decision (see section 12).
- Each user chooses how they want to receive event notifications: email, text, or both.

### Shared events and invitations
- When I create an event I can invite other app users (search by display name, or enter their email or phone number) and add guests who are not users by typing an email address or phone number, or by picking them from my Android contacts. Both ways must work (for example using the browser's Contact Picker API on Android Chrome; verify current support).
- Matching a typed email or phone number to an existing account must not reveal whether that person has an account or show anything from their profile. The invite simply goes out.
- An invited app user gets the event on their own calendar (pending until they answer) and answers **Yes**, **Maybe**, or **No**. A Yes stays on their calendar, a Maybe stays marked as tentative, and a No removes it. Invitees cannot suggest another time, because finding a time is handled by the availability check before the event is created.
- Guests without accounts receive an email (or text) with a secure link to answer Yes, Maybe, or No, so they never need an account.
- Any invitee can send a message to the host or to the other attendees by email or text. They type the message at that moment (it is not a template), and it is sent to each person individually.
- If anyone answers No, the creator is notified by email or text, based on the creator's notification preference. Cancellation rules are in the Cancelling an event or attendance section below.
- App users also get push or in-app notifications. Emails are sent automatically from a server-side function using a free-tier transactional email service (verify current options and limits, preferring free or open source). Automatic texts depend on the SMS decision (see section 12).
- Log every notification sent (who, how, when, status). Only message guests when the creator explicitly invites or cancels, include a way to opt out, and rate limit invitations and other messages to other people to prevent spam.

### Availability schedule
- Each user can set a recurring weekly schedule of when they are available or unavailable (for example, days or hours they are never free), plus one-off exceptions for specific dates such as vacations or appointments.
- When creating an event, the app checks the invited app users' availability, combining their schedule with their existing calendar events. It shows who is free and who has a conflict, and suggests times when everyone is free. Guests are not checked.
- Availability checks only reveal free or busy, never the titles or details of anyone's other events. Users can turn off sharing their availability.
- When an invited user is unavailable, the app warns the creator and suggests other times that work for everyone. It does not block creating the event.

### Cancelling an event or attendance
- **Who can cancel what:** only the creator can cancel the event for everyone. An attendee who cancels only drops their own attendance. In both cases, everyone else attached to the event (users and guests) is told, by email or text.
- Each event has a **Cancel and notify** button. After I confirm (the confirmation lists exactly who will be notified), it marks the event cancelled, or my attendance dropped, and notifies everyone. Nothing is sent unless I press it and confirm.
- **My cancellation messages:** each user sets up two cancellation messages in settings: one for when I drop out of an event, and one for when I cancel an event I created. The app provides a default for each when the account is created, and both are editable. They use double-brace variables such as `{{name}}`, `{{event}}`, `{{date}}`, and `{{time}}`.
   - Default when I drop out: "Hi {{name}}, I'm sorry, but I can't make it to {{event}} on {{date}} at {{time}}. Sorry for the short notice!"
   - Default when I cancel an event I created: "Hi {{name}}, I'm sorry, but I have to cancel {{event}} on {{date}} at {{time}}. Sorry for the short notice!"

- **Always individual:** the message is sent to each person separately, never as a group text. The variables are filled in for each recipient, so every copy is personalized (for example with that person's name).
- **Phase 1 texting (guests with only a phone number):** the app opens my phone's messaging app with one pre-filled message for one person. After I send it and come back, the app opens the next one, with a progress indicator such as "2 of 5", until everyone has been messaged. Emails, and push or in-app notifications to app users, are sent automatically.
- Fully automatic texting (no extra taps) is a Phase 2 upgrade. I will decide on it after Claude Code explains the options (see sections 10 and 12).
- This action needs a connection. If I am offline, show it as pending and ask me to confirm again when I am back online, so nothing is sent late by surprise.
- The app shows who was notified and how, and logs each message (see Shared events and invitations).

### Google Calendar sync
- Opt-in per user, using the Google Calendar API with OAuth. Ask for calendar access separately from sign-in.
- Start with one-way sync from this app to Google Calendar, then add two-way sync (changes made in Google appear here) using sync tokens or push notifications and a stored mapping of event ids, to avoid duplicates and loops.
- Optionally import Google Calendar busy times into the availability check.
- Google treats Calendar access as a sensitive scope, and public apps need Google's OAuth verification. Verify the current requirements and plan for them before opening the app to the public. Keep tokens server-side only and encrypted.

### Dashboard
- Configurable blocks and positions. Blocks: stats, task checklist, habits checklist, Random Quest button.
- Updates live via Supabase Realtime.

## 6. Notifications
- Support both Web Push and ntfy, selectable in settings.
- A scheduled server-side job finds due reminders and sends them. Pick the simplest reliable approach (for example a Netlify scheduled function, or Supabase scheduled jobs) and document its limits.
- Android is my phone, so test on Android Chrome installed as a PWA.

- Quiet hours (notifications are held until they end) and snooze options on reminders and routine prompts. Priority tasks are exempt from quiet hours unless I choose otherwise.
- Each device (phone, laptop, Pi) registers its own push subscription. Remove stale subscriptions when the push service reports them invalid.
- Reminder timing is critical, and it must respect each user's timezone. Before building notifications, compare Netlify scheduled functions with Supabase's built-in scheduler (pg_cron) for running a job at least every minute, and recommend one to me with the trade-offs.

## 7. Offline and sync
- Reads come from the local store first; writes are applied locally and queued.
- Sync on reconnect and via Realtime; resolve conflicts simply: **the last edit to reach the server wins** (the server sets `updated_at` on arrival). An older offline edit that syncs late can overwrite a newer edit from another device; this is accepted for Phase 1.
- Show a small online/offline/syncing indicator.

- Deletions are soft deletes (a `deleted_at` value) so they sync to other devices, and `updated_at` is set by the server rather than the device clock.
- Actions that notify other people (cancelling, declining, invitation messages) need a connection. If I am offline they show as pending, and I am asked to confirm again when I reconnect, so nothing goes out late by surprise.
- Sync layer: a simple custom queue on Dexie (IndexedDB). Record ids are generated on the device, so retried uploads never create duplicates. Changes are pulled by `updated_at` since the last sync, plus Realtime for live updates. Evaluated and rejected: RxDB (free tier allows only 13 open collections; paid from $99/month) and PowerSync (extra service and account, free instances deactivate when idle, harder for Pi device pairing).

## 8. Auth and security
- Google sign-in through Supabase Auth.
- Row-level security on every table. Never expose service keys in the front end; keep secrets in Netlify environment variables.
- The Pi display uses a revocable device pairing instead of my Google login (see section 9).

- Before anyone other than me uses the app (the Phase 2 social features), build: a data export of all my data (JSON or CSV), account deletion that removes everything, privacy policy and terms of service pages, and rate limits on invitations and any message sent to other people. Texting people also has consent and compliance rules; verify them before enabling it.

## 9. Raspberry Pi dashboard display
- A dedicated route (for example `/dashboard`) designed for a 10 inch touch screen: large touch targets, readable from a distance, no hover-only interactions.
- The Pi runs Chromium in kiosk mode pointed at the Netlify URL. Provide setup steps in the README (autostart, screen blanking settings, recovering from network loss).

- **Pairing instead of signing in:** don't sign the Pi in with my Google account. Use a "pair this display" flow: the Pi shows a code or QR code, I approve it from my signed-in phone, and the Pi receives a limited, revocable device token (it can read the dashboard and check off tasks and habits, nothing else). Verify the simplest secure way to do this with Supabase.
- Priority tasks also appear as a full-screen reminder on the Pi display.

## 10. Phase 2 (do not build yet, but don't block it)
- **Home Assistant** (pre-installed on my linknlink device) as the integration layer: webhooks and REST calls to and from the app.
- **Alexa/voice** to add items and hear reminders, likely via Home Assistant. Verify current requirements and costs before committing.
- **Smartwatch:** start by forwarding notifications to the watch; native watch apps come later.
- **Capacitor Android wrapper** for true full-screen priority alerts.

- **Automatic cancellation texts:** send the cancel message with no extra tap. Options to evaluate and verify current requirements and costs for: an open source Android SMS gateway app running on my phone (free, uses my own text plan, triggered from a Netlify function); an SMS plugin in the Capacitor Android wrapper; or a paid provider such as Twilio (not free, and US carriers require sender registration).

- **Social streaks:** follow or add other users, compare streaks on profiles, and optional leaderboards for accountability and friendly competition. Only with explicit opt-in sharing, and with the ability to block or leave at any time.

- **Achievements:** objectives that reward me for using the app and keeping up my routines and streaks. Earned achievements appear as badges on the Profile page (respecting my visibility setting) and are celebrated when earned with a small in-app moment and an optional notification. Examples: journal 5 days in a row; reach a 7-day or 30-day habit streak; complete a routine 10 times; finish every task in a day; beat my best streak; capture 25 thoughts; try a Random Quest. Claude Code and I will brainstorm the full list together before building this.
- Design for achievements now: define them as data (id, title, description, rule type, threshold) and calculate them from existing history, so new ones can be added without restructuring the app. Phase 1 must keep full completion histories (habit logs, routine step logs, journal dates, task completions) so achievements can be calculated retroactively. Store earned achievements per user with the date earned. Achievements that come from private habits are never shown to other users.

- **Google Calendar sync:** see the Google Calendar sync section under Calendar and reminders. Build one-way sync first, then two-way, after verifying Google's OAuth requirements.

### Phase 3: iPhone support
- Android is the only supported phone for Phases 1 and 2, but keep the core app free of Android-only assumptions so iPhone support can be added without a rewrite.
- Verify the current state of PWA support on iPhone before starting. Web Push on iPhone has required adding the app to the home screen (iOS 16.4 or later), and several Android features I rely on (the contact picker, share target, background behavior) may be missing or work differently.
- Decide between a PWA only and a Capacitor iOS app, which needs an Apple Developer Program membership and a Mac for builds (verify cost and requirements).
- iPhone texting can likely only open a pre-filled message for me to send (verify), so the one-message-at-a-time flow from the Cancelling section is the iPhone approach. The Android SMS gateway doesn't apply.
- Test reminders and routine notifications on a real iPhone, since reliability differs from Android.

## 11. Suggested build order
1. Repo, Vue + Vite + TypeScript + Tailwind scaffold, Vitest and Playwright set up with a first passing test, GitHub Actions, Netlify deploy, dev and production Supabase projects, Google sign-in, schema with row-level security. Start by walking me through creating the accounts in section 13.
1. PWA shell with offline storage, sync queue (with soft deletes), and quick capture (task, vault item, quest, or decide later), including voice-to-text. First milestone: capture works from my phone and laptop, even offline.
1. Tasks with carry-over, red text, cancel/edit, scheduling, priorities, "past you" voice.
1. Random Quest picker (quick win).
1. Habits with streaks, best streak, timer misses, private habits, and the Profile page that displays them.
1. Routines and completion stats.
1. Notifications (Web Push and ntfy, quiet hours, snooze) and priority task full-screen reminders.
1. Journal with auto stats.
1. The Vault buckets, global search and tags, and the basic calendar view.
1. Dashboard and Pi kiosk setup, including device pairing.
1. Shared events: contact info at signup, invitations, RSVPs, cancellations and notifications, and the availability schedule. Data export, account deletion, privacy policy and terms, and rate limits must be in place before anyone other than me uses the app.
1. Phase 2 integrations, including Google Calendar sync.
1. Phase 3: iPhone support.

After each step, the app should deploy and be usable, and all Vitest and Playwright tests must pass.

## 12. Questions for Claude Code to confirm with me before or during the build
- The "past you" voice is decided (see Voice and tone in section 2). Ask me if a new kind of message isn't covered.
- Recurrence options for tasks, reminders, and priority tasks (daily, weekdays, weekly, custom).
- Which stats to show on the dashboard and in journal entries.
- Anything in this document that conflicts with current platform limits; flag it rather than silently working around it.

- **Decision needed before building automatic texting:** explain the open source Android SMS gateway option to me in plain language, then wait for my decision. Cover how it works, the setup steps on my Android phone, cost, reliability (the phone must stay on and connected), battery and permission impact, privacy and security (where messages and phone numbers pass through, and how requests are authenticated), and how it compares with a Capacitor SMS plugin and a paid provider like Twilio. Check the project's current documentation rather than relying on memory.

- Email service for notifications (free tier, open source preferred), and whether phone numbers should be verified at signup (which needs an SMS service).

- Evaluate and recommend, but do not build without my approval: attaching an `.ics` calendar file to invitation emails so events land in guests' calendars, and a private `.ics` subscription feed so Google, Outlook, or Apple calendars can follow my events without needing Google's API verification.
- Evaluate and recommend: Capacitor with Firebase push for more reliable Android notifications, and when it makes sense to adopt it.

## 13. Accounts, services, and credentials

Before building, walk me through creating each account below. Ask me for the credentials and API keys when they are first needed, and do not assume you already have access to anything.

### Rules for handling credentials
- Ask me for each credential at the moment it is first needed. Tell me what it is for, where to find it, and which permissions or scopes to give it. Use the least access that works.
- Prefer login flows over pasted secrets when a command line tool offers one (for example `gh auth login`, `netlify login`, `supabase login`).
- Store secrets only in a local `.env.local` file that is listed in `.gitignore`, and in Netlify environment variables for the deployed app. Never commit secrets to GitHub, never print them in logs or output, and never put them in front-end code.
- Only the Supabase anon (publishable) key may be used in the browser. The Supabase service role key, the Google OAuth client secret, the VAPID private key, the email API key, and any SMS credentials are server-side only (Netlify Functions).
- Provide a `.env.example` file listing the variable names without values, and document in the README where each one comes from.
- If a key is ever exposed, tell me right away and walk me through rotating it.

### Services needed for Phase 1
- **GitHub** (https://github.com): hosts the code. Needed: an account, a new repository, and a way for you to push (GitHub CLI login, or a personal access token limited to that repository). Netlify deploys from this repository.
- **Netlify** (https://www.netlify.com): hosts the web app and runs the server-side functions, including scheduled ones. Needed: an account, a site linked to the GitHub repository, and environment variables for the secrets below. Verify the current free-tier limits.
- **Supabase** (https://supabase.com): database, Google sign-in, row-level security, and realtime sync. Needed: an account, a new project, the project URL, the anon key (browser), the service role key (server only), the database password, and an access token if you use the command line tool for migrations.
- **Google Cloud Console** (https://console.cloud.google.com): provides the OAuth client used for Google sign-in through Supabase. Needed: a project, the OAuth consent screen, a web OAuth client ID and secret, and the redirect URL that Supabase provides.
- **Email sending service** (free tier, for example Resend at https://resend.com or Brevo at https://www.brevo.com): sends invitations, RSVP notices, and cancellation emails. Recommend one after checking current free limits. Needed: an account, an API key, and a verified sender address or domain. A domain name that I own makes email delivery much more reliable; there is none yet (see Domain name below), so revisit this when choosing the service.
- **ntfy** (https://ntfy.sh): push notifications to my phone. No account is needed to start. Treat the topic name like a password: use a long random one, since anyone who knows it can read or send to it. Ask me before using a self-hosted server instead.
- **Web Push keys (VAPID):** no account needed. Generate the key pair yourself; the private key is server-side only.

### Services for later phases
- **SMS sending (only if I choose it):** after explaining the options to me, either an Android SMS gateway app on my phone (no signup; explain the setup) or Twilio (https://www.twilio.com; paid, and US sender registration is required).
- **Google Calendar API** (Phase 2): enabled in the same Google Cloud project, with its own OAuth scopes and Google's verification process.
- **Home Assistant and Alexa** (Phase 2): Home Assistant is already running on my linknlink device, so ask me for its URL and a long-lived access token when we get there. Alexa needs an Amazon developer account (https://developer.amazon.com).
- **Domain name:** none for now (decided 2026-11-06). The app uses its free Netlify address, https://myadhdbrain.netlify.app. Revisit before choosing the email service (shared events build step) and before Google's OAuth verification for a public app, since both work much better with an owned domain.

## 14. Decisions

- 2026-11-06 — Answered §12 visual style: calm neutrals, one accent, follows system dark mode (§3). Quick capture: optional non-blocking task date, blank goes to a new Undated list (§5 Tasks). Starter Vault buckets: Shopping list, Restaurant reviews, Places to go. Chrome speech recognition accepted despite audio going to Google.

- 2026-11-06 — Sync layer: custom Dexie queue instead of RxDB or PowerSync (reasons in §7). Conflict rule clarified: last edit to reach the server wins, because device clocks are not trusted; accepted for Phase 1 as a single user.

- 2026-11-06 — Step 1 schema covers the shared conventions (server-set `created_at`/`updated_at` trigger, soft delete, RLS pattern) and `profiles`, created automatically on first Google sign-in. Each later feature's tables are added in that feature's build step, following the same pattern. Clients never hard-delete; account deletion will be a server function.
- 2026-11-06 — Docker is not installed, so there is no local Supabase stack. Database rules (RLS) are tested against the dev project two ways: Vitest integration tests as a signed-out visitor (`tests/integration`, skipped in CI where no keys are configured), and SQL rule checks that act as two fake users inside one rolled-back statement (`supabase/tests/*.sql`, run with `npm run test:db`; pgTAP's `supabase test db` needs Docker). Each check raises to force the rollback, so `scripts/test-db.mjs` reads the raised `PASS:`/`FAIL:` message and reports a normal pass or fail. Migrations go to dev with `npx supabase db push --remote`.
- 2026-11-06 — All user-facing wording lives in `src/messages.ts` (§2 Voice and tone). Current strings are drafts pending the user's review.

- 2026-11-06 — Supabase projects created in us-east-1: `my-brain-dev` (ref `qtrsmslghsbiezbdmmmd`) and `my-brain-prod` (ref `lcpmvpjjvdkzebbpbymy`). Local development and Netlify Deploy Previews use dev; production (`main`) uses prod. One Google OAuth web client serves both projects.

- 2026-11-06 — Netlify project created: https://myadhdbrain.netlify.app (production = `main`; Deploy Previews on for pull requests; branch deploys off to save credits).

- 2026-11-06 — Netlify deploy budget: merge to main once per build step, using a branch and its deploy preview during the step (rule in §3). Chosen over manual publishing or changing hosts to keep the spec's Netlify Functions plan.

- 2026-11-06 — No domain name for now; use the `*.netlify.app` address. Revisit before the email service and Google OAuth verification.
- 2026-11-06 — Verified free tiers. Supabase: 2 active free projects (exactly dev + prod); free projects pause after 1 week of low activity, so the dev project may need unpausing. Netlify: 300 credits/month hard limit; production deploy 15 credits, bandwidth 20 credits/GB, web requests 2 credits per 10,000, compute 10 credits/GB-hour.  A once-a-minute Netlify scheduled function also spends compute credits, which counts against it in the §6 scheduler comparison.

- 2026-11-06 — Scaffolded the local project (step 1 code that needs no accounts) before the §13 account walkthrough, so the walkthrough can end in a working deploy. The walkthrough happens next.
- 2026-11-06 — Tailwind CSS v4 via the `@tailwindcss/vite` plugin (no `tailwind.config` file). Pinned to 4.3.4 because the 4.3.5 package was missing from npm on this date; unpin later.
- 2026-11-06 — Playwright runs two projects: desktop Chromium and a Pixel 7 (Android phone) viewport, against the production build.
