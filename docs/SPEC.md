# Project Instructions: My Brain

Hand this document to Claude Code as the project brief. It describes what to build, the chosen stack, the rules for each feature, and the order to build in.

## 1. Overview

My Brain is an app where you store everything you need to remember. It is a personal productivity and "boredom buster" app that I can reach from anywhere (Android phone, iPhone, laptop and desktop). Its most important job is **instant capture**: whenever I have a thought, I can record it in a couple of taps, even offline.

### How to work: spec-driven development

This project is built **spec-first**. This document is the spec, and it is the source of truth for what to build. Follow these rules for the whole project:
- **Read first, but only what the task needs.** Start every session by reading `CLAUDE.md`, `PROGRESS.md`, and sections 1–3 of this spec. Then list the spec's headings (`grep -n '^#' docs/SPEC.md`) and read only the sections the task touches. Read section 10 (Phase 2/3) and `docs/DECISIONS.md` only when the task concerns them; search them rather than reading them whole. Read `docs/PROGRESS_ARCHIVE.md` only when a past step's history matters.
- **The repo copy is the source of truth.** Save this document in the repository as `docs/SPEC.md`, and keep `CLAUDE.md` short, with the key rules and the build and test commands, pointing to the spec. Once it is in the repo, update that copy, not any other.
- **Keep the spec updated.** When a decision changes, a requirement is clarified, or something is built differently than written, update `docs/SPEC.md` in the same change as the code. Never let the code and the spec disagree silently.
- **Spec first for changes.** When I ask for something new or different, say which parts of the spec will change and get my OK. Update the spec, then build it.
- **Don't guess.** If the spec is silent or unclear, ask me, then write the answer into the spec. When an open question in section 12 is answered, move the answer into the section it belongs to and remove the question.
- **Check against the spec.** Before calling a build step done, compare the work to the spec sections it covers. Name each Vitest and Playwright test after the rule it proves, and tell me about any rule that has no test yet.
- **Track progress.** Keep `PROGRESS.md` current: what is done, what is in progress, what is next, linked to spec sections and build steps. End each session by updating it. Keep it short: when a piece of work is merged and a few newer ones follow, move its section to `docs/PROGRESS_ARCHIVE.md`.
- **Log decisions.** Record significant decisions, and changes of mind, with the reason, at the end of `docs/DECISIONS.md`.
- **Keep the spec concise.** It holds rules and decisions, not code. Flag contradictions in the spec, or conflicts with current platform limits, instead of working around them silently.

It combines a daily checklist (routines, habits, tasks, priority tasks), a journal, "The Vault" for things to remember, a calendar/reminders view, a dashboard, and a Random Quest picker that chooses a project from my bucket list when I'm bored. Tasks are presented in the voice of "past you" (for example, "Past you left you this one").

## 2. Guiding principles
1. **Capture first.** Quick capture must be the fastest thing in the app. It asks where the thought goes: task, vault item, or quest.
1. **Works offline.** Capturing and checking things off must work with no connection and sync later.
1. **Multi-user ready.** I am the only user at first, but the app may become public someday. Every record belongs to a user and is protected by row-level security from day one.
1. **Free and open source.** Prefer free tiers and open source tools. Avoid paid or proprietary dependencies unless noted.
1. **Simple and documented.** Prefer simple, mainstream choices. Make small commits, keep a README that explains setup and key decisions, and explain notable trade-offs as you go.

1. **Confirm before impact; undo for the rest.** Anything that affects other people (cancelling or declining an event, deleting an event with guests, sending messages to others), removes many things or history at once (Delete my data, a bucket with items, a habit or routine with its history), or can't come back (Delete My Account) first shows a confirmation that says what will happen and who is affected. Removing **one** thing (a task, quest, Vault item, routine step, saved person, or an event with no guests) and clearing lists (Clear crossed-off, Clear checked, marking a quest done) happen straight away, with an **Undo** bar at the bottom of the screen for 8 seconds ("Deleted 'Buy stamps' · Undo"), since deletes are soft and can be put back. Routine actions like checking off a task or a quick capture need neither.
1. **Calm by design (ADHD-friendly, 2026-11-10).** The app is built for neurodivergent people and must never feel loud or urgent:
   - **Colours:** warm off-white (dark: deep slate) background, soft charcoal text, a soft blue accent, sage green for done. Priority dots are muted (Low sage, Medium soft ochre, High muted terracotta) and always come with their label. Red is kept for real errors and Delete My Account; Delete my data is orange. Post It colours are pale.
   - **Icons:** plain outline icons in one style (like the tab bar), never colourful emoji.
   - **Text:** short and literal, readable at a skim: hints are at most one short line, or gone when the label says it; buttons say what they do ("Save task", "Delete quest"). Emphasis is bold, never italics or capitals. Body text has a line height of at least 1.5, is left-aligned, and reading pages keep lines to about 70 characters. The user's own playful lines stay as written; new wording is plain.
   - **Space:** generous padding and gaps, one main button per area, nothing crowded; optional fields are in More details (§5 Forms).
   - **Choices look alike everywhere:** a chosen option (weekdays, how often, energy, priority, answers, tabs, view switches) is a soft tint with a check mark, never a solid fill that looks like the main button. List rows end in the same small actions (an **Edit** button on every task and priority task, Cancel task when a task keeps slipping).
   - **Motion:** nothing moves on its own; transitions are gentle and respect reduce-motion. The one kind of lively motion is a **celebration** right after I finish something (§5 Celebrations): short, never blocking, and toned down by reduce-motion or my Celebrations setting.
   - **Sound:** the app never plays sounds (2026-11-11). The one exception is the Focus timer's chime when a part ends, because it's an alarm I set.
1. **Accessible to everyone (WCAG 2.2 Level AA).** Every screen meets WCAG 2.2 Level AA: it works with a keyboard alone and with screen readers, has visible focus, enough color contrast in light and dark, tap targets of at least 24×24 px (44×44 px where practical), labels on every control, no meaning carried by color alone, text that can be enlarged to 200% and reflow at 320 px wide without losing anything, and motion that respects the device's reduce-motion setting. **Windows (modals) trap focus:** when one opens, focus moves into it and Tab / Shift+Tab stay inside it (a confirmation opened over an editor takes over until it closes); when it closes, focus returns to the control that opened it (or the page heading if that control is gone). This covers every window, the full-screen editor, and the phone menu (Escape closes it and returns to Menu). **Every window has a close ✕ in its top right corner, and clicking outside it (on the dimmed background) closes it**, like Escape; a click that starts inside (selecting text) doesn't count. All new work keeps this: automated accessibility checks (axe) run on every page in the test suite, and anything they can't check is reviewed by hand.
1. **Long lists come in pages.** Any list that can grow long is shown a page at a time with a shared page control (Previous, "Page 2 of 5", Next), so pages never get endlessly long.
1. **Sort by dragging.** Anywhere I put things in my own order (routine steps, and any list added later), I drag them by a handle (⠿) with mouse or touch. The arrow keys on the handle move an item too, for keyboard use, and tapping the handle shows **Move up** and **Move down** buttons, so nothing needs dragging (WCAG 2.5.7).

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
- **Visual style:** calm, soft neutral colors with one accent color (soft blue), following §2 Calm by design; light or dark following the device's system setting.
- **Front end:** Vue 3 (Composition API) with Vite, Vue Router, and Pinia. Use TypeScript throughout (front end and server functions) and Tailwind CSS for styling, mobile-first so it also works on the 10 inch touch display.
- **PWA:** installable on Android, with a service worker (for example vite-plugin-pwa / Workbox), a web app manifest, home-screen shortcuts for quick capture, and Web Share Target so I can share text from other apps into the capture screen. A new version takes over as soon as it has downloaded (the app reloads itself, saving anything being typed first), so an installed app that stays open for days still gets updates.
- **Backend/data:** Supabase (open source; hosted free tier): Postgres, Google sign-in, row-level security, and Realtime for syncing across devices.
- **Server-side Node code:** Netlify Functions (including scheduled functions) for anything that must run on a server, such as sending push notifications. Verify current Netlify and Supabase free-tier limits before relying on them.
- **Offline storage:** IndexedDB (for example Dexie) with a queue of pending changes that syncs when online.
- **Calendar view:** an open source Vue calendar library (for example FullCalendar).
- **Notifications:** both built-in Web Push (VAPID) and ntfy (open source push; HTTP publish to a topic). I want to be able to receive reminders either way.
- **Hosting/deploy:** GitHub repository, auto-deployed to Netlify. Database schema lives in the repo as Supabase migrations.

### Navigation
- **"My Brain" goes home:** the Home icon in the header (phones) and the app name at the top of the side menu (wide screens) open the Dashboard, the home page. The Dashboard isn't a tab or menu item of its own.
- **Phones (under 768 px wide):** a **tab bar along the bottom** with five tabs, each an icon with its name: **Tasks, Habits, Calendar, The Vault, More**. The current page's tab is highlighted (and marked as the current page for screen readers). **More** opens a panel from the bottom with everything else: Routines, Journal, Quests, Orphans (with its count) and Connections (Focus timer and Account are in the header); its tab is highlighted when I'm on one of those pages, and shows the Orphans count too. There's no Menu button. The Capture button and the minimized Focus timer sit just above the tab bar, and pages leave room so nothing is hidden behind it.
- **Header (2026-11-10, user's choices):** a bar along the top of every signed-in page, on phones and wide screens. Phones: a **Home** icon (named My Brain for screen readers; opens the Dashboard) and **Search** on the left. Then, in this order: **Account** (my profile picture, or a plain person icon when I have none or it can't load; opens the Account page), **Focus timer** (stopwatch icon; starts or reopens the timer), the **alerts bell** and **sync status**. Sign out is on the Account page, not in the header (2026-11-11). Wide screens keep My Brain and Search at the top of the side menu, so the bar has the other four, on the right. Sync status on phones is the coloured dot alone, with its words for screen readers and on hover; wide screens show the words too. Everything stays on **one line** on every phone, down to 320 px wide, without scrolling sideways: controls are 44 px, or 40 px on screens under 360 px wide. Every control has a name for screen readers.
- **Wide screens:** the side menu shows My Brain, Search, then **Tasks, Habits, Calendar, The Vault**, then a **More** button that opens or closes the rest of the list (the same pages as the phone's More) right there in the menu. More stays open or closed as I left it on this device, and opens by itself when I'm on one of its pages.
- Everything works with a keyboard and screen readers; every tab and item is at least 44 px tall.

### Testing, quality, and workflow
- **Dev test accounts (dev only):** `npm run dev:accounts` creates or resets three test accounts in the dev project only (Dev Alice, Dev Bob, Dev Carol; their shared password goes to `.env.local` and is never printed) so sharing and connections can be tried as more than one person. A dev-only password sign-in for them appears on the sign-in page only on the local dev server (`npm run dev`) with `VITE_DEV_SIGN_IN=true`, never in a production build; email/password sign-in is turned on in the dev project only, and production stays Google-only. `npm run test:flows` walks the connection and sharing flows against the real dev backend as those accounts and tidies up after. Both scripts refuse to run against production. Claude doesn't type passwords into the app itself (its safety rules); it runs `test:flows` instead.
- Use **Vitest** for unit and integration tests and **Playwright** for end-to-end tests in a real browser (including a phone-sized screen and, where possible, offline and installed-PWA behavior). **Phone runs are targeted (2026-11-11, user):** every browser test runs on desktop; Android and iPhone run only the tests that could fail differently on a phone (layout and navigation, touch and drag, native date/time and contact pickers, full-screen windows, text links, Safari's engine, accessibility scans). These are whole files listed in `playwright.config.ts` plus tests tagged `@phone`. A new test that depends on screen size, touch or the browser engine gets the tag.
- **Prove it works.** Claude Code must use Vitest and Playwright to show that its code works: write tests for each feature as it is built. **Two levels:** quick checks after every change while coding (`npm run test:quick`: types, Vitest, desktop browser tests), and the full review only when the user says to merge, merging only if it passes (`npm run test:all`: lint, types, Vitest, and the browser tests as desktop, Android and iPhone, plus `npm run test:db` when there are migrations), so new work doesn't break old behavior without running everything every time. Fix any regression before moving on, and tell me what was tested.
- **Long text.** Anywhere the app shows something I typed (titles, notes, journal writing, Post Its, bucket names, tags, events), tests use long text too: a long sentence, a paragraph, and an unbroken string such as a pasted link. Every page must still fit a 320 px wide screen with no sideways scrolling.
- Time-dependent logic (midnight rollover, carry-over, streaks, expired habit timers, timezones, daylight saving changes) must be tested with a mocked clock.
- GitHub Actions runs linting, type checking, Vitest, and Playwright on every pull request. Netlify deploy previews are used for branches, and the main branch is production. **Merge to main once per build step** (one production deploy per step), because the Netlify free plan allows only about 20 production deploys a month (see Decisions). Work happens on a branch per step, tried out through its deploy preview.
- Use two Supabase projects, one for development and one for production (verify the free tier allows this), with migrations stored in the repo.
- Keep a `PROGRESS.md` (what is done, what is next, and decisions made) and update it at the end of each session. Also create a short `CLAUDE.md` with the key rules and the build and test commands, pointing back to this document.

## 4. Data model (all tables have `id`, `user_id`, `created_at`, `updated_at`, and deleted_at (soft delete, so deletions sync to other devices), with row-level security so users only access their own rows. updated_at is set by the server, not the device clock)
- **profiles:** timezone, display settings, notification preferences (ntfy topic, quiet hours, default snooze length), email, phone number (both required at signup), preferred event notification method (email, text, or both), display name, avatar, and a visibility setting for who can see my streaks (private by default).
- **tasks:** title, notes, due date, priority, status (open, done, cancelled), completed_at, cleared_at (hidden from the list by Clear crossed-off), carry_over_count, source (manual, capture, journal).
- **habits:** title, notify time, timer duration (how long I have to complete it; an expired timer counts as a miss), cached current streak and best streak (the source of truth is habit_logs, so streaks can always be recalculated), is_private (hidden from my Account page and from all other users).
- **habit_logs:** habit id, date, status (completed or missed), completed_at (so history and streaks can be recalculated and stats survive).
- **routines:** title, notify time, weekdays (or none, for a run-anytime routine), ordered list of steps. A step is either its own text or a link to one of my habits.
- **routine_steps:** routine id, position, title.
- **routine_runs / routine_step_logs:** per day, which steps were completed or skipped, for completion stats. Routines and steps also store weekdays and a start date.
- **priority_tasks:** title, description, reminder time, a date (one-off) or weekdays (repeating), status. Priority habits are habits with a priority flag.
- **journal_entries:** date (one entry per day), body text, auto-generated stats snapshot for that day (`stats`, JSON), whether the stats are final (`stats_final`), and whether the app wrote the entry on my behalf (`auto`).
- **post_its:** sticky notes for the Dashboard: body (formatted HTML, like the journal), color (yellow, pink, blue or green) and position (lowest first; a new note goes in front).
- **people:** people I've invited by email or phone, saved to invite again: name (optional), email, phone (at least one of the two). Synced like everything else; only mine.
- **vault_buckets / vault_items:** user-defined buckets (restaurant reviews, places to go, books, shows, ideas to research, shopping list) and the items inside them. A bucket has a name, position, and whether its items can be checked off. An item has a title, notes, an optional star rating (1–5), an optional link or address, and, in checklist buckets, whether it is checked.
- **quests:** title, details, time bucket (estimated time), energy level, status (open or accepted; a done quest goes back to open), last_picked_at, times_picked, completed_at (the last time). **quest_logs:** quest id, date, completed_at, one per time a quest was done (for stats).
- **badges:** kind and earned_at, one per first-time badge (§5 Celebrations); the id is made from my user id and the badge, so it's the same on every device. **profiles.celebrations:** full, gentle or off.
- **events:** title, notes, start, end (or all day), repeat (never, daily, weekdays, weekly, every 2 weeks, monthly, yearly), and reminder (none, or minutes before the start). Personal calendar items; shared events and invitations come in step 11.
- **event_invites:** one per person invited to an event: the event, a name, an email and/or phone number, whether they are an app user (kept server-side, never shown to the inviter), their answer (pending, yes, maybe, no, or dropped out) and when, and for guests a secret answer link (stored hashed). The creator sees the people they invited and their answers; an invited user sees only their own invite.
- **availability:** my weekly unavailable times (weekday, from, until) and one-off exceptions for specific dates (all day or from–until, unavailable or available), plus whether I share my free/busy times.
- **outbound_messages:** every email, text and push sent to someone about an event (who, how, kind, when, status, error), written by the server; also the queue the server sends from. **message_optouts:** email addresses and phone numbers that asked not to be messaged.
- **dashboard_config:** which blocks are shown and their positions, per device or layout name.
- **inbox (capture queue, shown as **Orphans**):** raw captured text that hasn't been filed yet, used when I choose Decide later, or when a capture is saved before its destination is chosen.

- **events (additions):** status (active or cancelled), cancelled_at.
- **event_attendees:** event id, user id (for app users) or guest name, email and phone number, role (creator or invitee), RSVP status (pending, accepted, maybe, declined, cancelled), and a secure token for guest RSVP links.
- **message_templates:** user id, type (for example attendee_cancel, event_cancel, and others), body with {{variable}} placeholders. Each user can customize their templates; app defaults are used when none is set.
- **sent_messages:** event id, attendee id, message text, status, sent_at.

- **availability_rules:** user id, weekday, start and end time, available or unavailable. **availability_exceptions:** user id, date range, available or unavailable, note.
- **external_calendar_links:** user id, provider (Google), encrypted tokens (server-side only), sync settings, sync token, and a mapping between event ids and Google event ids.

- **push_subscriptions:** user id, device label, push endpoint and keys, last_seen. One per device (phone, laptop); remove subscriptions that the push service reports as invalid.
- **tags / item_tags:** user-defined tags (a name, unique per user ignoring case) attached to tasks, habits and routines.
- **Search:** runs on the device's own copy of my data (see Global search and tags).

## 5. Phase 1 features and rules

### Quick capture
- One-tap access from the home screen shortcut and a persistent button in the app. In the app, Capture opens as a window over the page I'm on, so it never takes me away (for example, I can add tasks while writing in my journal); closing it returns me exactly where I was. The home screen shortcut and text shared from other apps open the Capture page.
- **Choose the type first**, then fill in a form that fits it. Only the title is required; everything else is optional or has a default, and optional details sit in **More details** (see Forms):
   - **Task:** Title, Date (blank = the Undated list), Notes (formatted), Priority (default Low), all in view.
   - **The Vault:** Bucket (pick one, or make a new one; the first bucket is preselected), Title, Notes (formatted).
   - **Quest:** Title; then Energy needed (default Ugh), Time needed (default 30 min) and Details (formatted), all in view with extra space between them (no More details).
   - **Habit:** the full habit form, laid out like the habit editor (see Habits).
   - **Post It:** a small formatted text box (the journal's editor, smaller) and a color (yellow by default, or blue or green; pink was removed, and older pink notes still show pink). No title; the note itself is required. It goes to the top of the Dashboard.
   - **Decide later:** just the text, saved to **Orphans**.
- Text shared from another app is kept while I pick the type: its first line fills the title and the rest fills notes or details.
- Works offline; items are queued and synced later.

- **Decide later** saves the text to **Orphans** (the menu item and page formerly called Inbox) so I can sort it when I have time.
- A microphone button fills in the title (or the Decide later text) using the device's speech recognition (free; verify browser support). Accepted: on Chrome this sends the audio to Google's servers for transcription. Hide the button where the browser has no speech recognition.
- Any item can later be converted to another type, for example a vault item into a task.

### Tasks
- Daily list, plus the ability to schedule tasks for future days.
- An Undated list holds tasks with no due date. Undated tasks never carry over; giving one a date moves it onto that day's list.
- Completing a task crosses it off. **Clear crossed-off (N)** above the list (day or Undated, shown when something is crossed off) hides the crossed-off tasks from that list. They aren't deleted: they stay in history and every count (Journal, Dashboard, achievements), and a day whose tasks were all done and cleared still says everything is done. Un-crossing a task (from search or the calendar) brings it back.
- The day ends at **midnight in my timezone**. A task not completed by then carries over to the next day, its title shown in **muted terracotta** (the calm stand-in for red, SPEC §2) with a note saying it carried over.
- If it carries over a second time, show **Cancel** and **Edit** buttons so I can make it easier or remove it. Cancel marks the task cancelled (it leaves the list but stays in history); Delete, inside Edit, asks for confirmation first.
- Every task row, in the day list, Undated and Priority, has an **Edit** button at its end (the title opens it too); a task that carried over twice also shows **Cancel task**.
- "Today" is the calendar date in the device's current timezone, so carry-over follows me when I travel. The profile's timezone is kept in step with the device for server-side jobs (notifications).
- Priority levels change how the task is rendered (for example emphasis, order, color). Three levels: **Low** (sage), **Medium** (soft ochre), **High** (muted terracotta), shown as a colored dot and label beside the task. New tasks default to Low. Open tasks are ordered High, Medium, Low, then oldest first. Coloured title text is reserved for carried-over tasks; priority only colours the dot, so the two never look alike.
- Present tasks in the "past you" voice.

- Carry-over is calculated from each task's due date and today's date in my timezone when the list is displayed (and by a server-side job for notifications), not by a counter that only runs while the app is open. It stays correct when the app was closed or offline, or when I travel across timezones. `carry_over_count` is derived the same way. Test daylight saving changes and timezone changes.

### Habits
- Fields: title, **start date** (today or later, default today), notify time, timer (time window to complete), how often (**every week**, **every 2 weeks** or **every month**, default every week), the weekdays it repeats on for weekly and every-2-weeks habits (default every day), private, tags.
- **Form layout (habit editor and Capture):** Title; Private right under it; then how often with the days it **repeats on** right under it, and the start date; then **Reminders**, a fold-out (like More details) with the reminder time, timer and Priority, open by itself when a reminder time or Priority is set; then tags (editor only). Extra space between these sections. No More details.
- **How often:** every week and every 2 weeks use the chosen weekdays, and every 2 weeks counts from the week of the start date (so two habits on the same weekday, starting a week apart, alternate: Recycling one Thursday, Trash the next). **Every month** repeats on the start date's day of the month (the 12th); in a shorter month, a 29th–31st falls on the month's last day. The habit editor and Capture's habit form both have these.
- **Timer** starts at the notify time: notify 8:00 am with a 2-hour timer means done by 10:00 am. With no timer (or no notify time) the habit is due by midnight. **On the day a habit is created it is always due by midnight**, so it is never missed the moment it is saved; the timer applies from the next day. A timer needs a notify time. A habit can be completed any time before its deadline, and a completion can be undone until then.
- **Scheduled days:** a habit only counts on its scheduled days (its chosen weekdays, in every other week if it repeats every 2 weeks, counted from the week it starts; weeks run Sunday to Saturday; or its day of the month if monthly), and never before its start date. Days it isn't scheduled neither extend nor break the streak. A habit's history starts on its start date.
- Track a streak of scheduled days in a row. A missed day resets it to zero, and the app keeps my **best streak** as the new goal to beat. Current and best streaks are shown on the Habits page and the Dashboard (see the Account page section below).

- The Habits page displays this line, worded exactly: "You are only in competition with yourself." It keeps the focus on beating my own best streak.

- When creating or editing a habit, I can mark it **private**. A private habit never appears on my Account page or in any badge or achievement shown to others, and other users cannot tell it exists. Enforce this in the database (row-level security and the restricted view), not just in the interface. Habits are not private by default, but nothing is shared with anyone until my profile visibility setting allows it.

- **Timer:** if the timer expires before I complete the habit, it counts as a **miss**. The habit is logged as missed for that day and the streak resets to zero, while my best streak is kept.

### Account page
- **Layout (grouped, 2026-11-08; regrouped by the user 2026-11-11):** under my picture and name, the page has groups that open and close (an accordion), each with a one-line summary: **Your profile** (name and who sees my profile, side by side, with its own Save), then **Account Settings** ("Customize your experience"), which holds **Celebrations** (Full, Gentle or Off, with its own Save), a **Tags** row (with Open Tags, linking to the Tags page) and the groups **Reminders** (this device's notifications, ntfy, quiet hours, snooze), **Events** (phone, how event news reaches me, cancellation messages, and my availability, side by side on wide screens), **People** (Connections and my people) and **Your data** (download and delete my data, side by side). Then **Sign out** and **Delete account**, each on its own and always visible (not inside a group), Sign out first. Only **Your profile** starts open; which groups I leave open is remembered on this device. Several can be open at once. The page is wider on big screens so things can sit side by side, and hints are kept to one short line. Privacy and terms links sit at the bottom. Groups are real disclosure controls (they work with a keyboard and screen readers).
- Every user has an Account page with a display name and avatar. Streaks are shown on the Dashboard, not on the Account page.
- **Delete My Account** is at the bottom of the Account page. It first shows a confirmation that says everything will be permanently deleted on all devices and cannot be undone, and I must type DELETE. Then it deletes my account and all of my data on the server, clears this device's stored copy and push subscription, signs me out, and tells me it is done. If it fails (for example, offline), it says so and nothing is deleted.
- The page shows each habit's **current streak** and **best streak**, plus overall highlights such as my longest streak ever, so I can feel proud of them.
- Streaks are meant to create accountability and friendly competition between users, so the page can be viewed by other users I choose to share it with.
- **Privacy comes first.** Streaks are private by default, and I can choose who sees them (only me, people I approve, or everyone). Other users must only ever see the streak numbers and habit titles I choose to share, never my tasks, journal, vault, reminders, or events. Enforce this with row-level security and a restricted view, not just in the user interface.
- Habits marked private (see Habits) never appear on my Account page, and other users cannot tell they exist, for example anything personal like meds.
- Phase 1 builds the Account page for myself, with the visibility setting in place: it defaults to **only me**, can be changed now, and sharing takes effect only when Phase 2 adds other users. Display name and avatar come from Google sign-in; the display name is editable. Settings on the Account page are grouped into two cards, Your profile and Reminders, each with its own Save.

### Routines (chained tasks)
- A routine is an ordered series of steps with a notify time. In the routine editor, steps are put in order by drag and drop.
- **Routine form layout:** Title; the steps; **When it runs** (Run anytime, then how often with the days it repeats on right under it, like habits); the reminder time on its own (no Reminders heading or box); tags. Extra space between sections. A new routine starts as **Run anytime**; unticking it gives every day as the starting schedule.
- Completing a step shows the next step.
- Track how often I complete the routine overall, and how often I complete each step versus how many times it was possible.

- **Example routine, Daily Morning Routine:** "Wake up by 7am" → "Brush teeth" → "Shower" → "Skin care" → "Take medication".
- **Phone notifications exist to get me into the app.** A routine's notification fires at its notify time, and tapping it opens My Brain straight to the routine in progress. Don't depend on action buttons inside the notification. Once the app is open, the app handles displaying and advancing the routine steps.
- In the app, each step shows **Skip** and **Completed** buttons. Pressing either one shows the next step in the routine.
- **Skip:** the step simply moves on to the next one, with no animation. The step is recorded as skipped.
- **Completed:** the current step plays a cross-out (strikethrough) animation, then clears and the next step appears. The step is recorded as completed.
- Skipped steps still count as possible steps in the completion stats, so the stats compare completed steps against all the times each step could have been done.
- **Weekdays:** like habits, a routine runs on chosen weekdays (default every day), every week or every 2 weeks, and its history starts the day it was created.
- **Completed overall** means reaching the last step that day, even if some steps were skipped; the per-step stats still show the skips.
- **Habits as steps:** when adding a step I can type a routine-only step (as now) or choose one of my habits (for example "Take medication" inside the Morning Routine). A habit step shows the habit's name (and ⚠ if it is a priority habit) and stays linked to it:
  - Completing the step also completes the habit for that day (one tick counts for both; the habit's streak goes up as usual).
  - If the habit is already done that day (ticked on the Habits page or from its reminder), the step shows as done and the routine moves past it.
  - Skipping the step does not mark the habit missed; the habit stays open until its own deadline.
  - The habit's own reminders still go out unless it is done, so a reminder is still the safety net if the routine is abandoned halfway.
  - On days the habit isn't scheduled, its step is left out of that day's routine. If the habit is deleted, its step is removed from the routine.
- **Run anytime (no schedule):** a routine can have no schedule, for breaking a big job into bite-size steps (for example "Clean the garage"). It has no weekdays and no reminder, is never counted as missed, and can be started from the Routines page at any time. Progress carries over between days until I reach the last step; after that, "Start again" begins a fresh run. Its stats show how many times I have finished it, and per-step completed and skipped counts.
- **Possible days** are every scheduled day from the routine's start (for a step, from the day it was added) up to yesterday, plus today once finished. A scheduled day I never start counts as possible, so it lowers the stats.
- A run can be left and continued later the same day; it picks up at the first step not yet completed or skipped. Removing a step keeps its history.
- Each routine has its own screen (`/routines/<id>/run`) so the step 7 notification can open it straight to the routine in progress.

### Priority tasks and priority habits
- Reminder time, title, description.
- **Always in the future:** a new priority task starts at the next whole hour. A repeating one starts today only if its time is still to come, otherwise tomorrow; a one-off must be later than now ("Pick a time later than now."). So saving one never sets it off straight away.
- **Priority habits:** any habit can be marked **Priority** (medication is usually a habit). A priority habit gets the same full-screen reminder, slider and backup alerts as a priority task, at its reminder time. Completing it with the slider completes the habit for the day.
- **Priority tasks** stay for critical things that are not habits. A priority task is either one-off (a date) or repeats on chosen weekdays, every week or every 2 weeks, like habits.
- **When a priority reminder is due** it stays up until I act: **slide to complete**, **Snooze** (10 minutes), or **Cancel** (no more reminders for it today; a habit is not completed by cancelling). It does not re-send on its own; the notification stays on screen until I respond, and an urgent ntfy alert goes out as a backup.
- Full-screen reminder that must be marked complete with a **slider**.
- In the PWA, build the best version possible: a full-screen in-app overlay plus a persistent notification until I complete, snooze or cancel it. Note the limits of what a browser can do.

- Medication-style reminders matter, so don't rely on the PWA alone. Android battery saving can delay web notifications. Also send an ntfy notification at urgent priority as a backup (verify whether the ntfy Android app can break through Do Not Disturb), show a short in-app notice that reminders may be delayed and shouldn't be the only safeguard for critical medication, and build the Capacitor Android wrapper earlier if reliability falls short.
- Quiet hours never silence priority tasks or priority habits unless I choose that.

### Journal
- End-of-day check-in: write how the day went. New tasks (for tomorrow or any day) are added with the Capture button, which opens over the Journal and keeps my writing; there is no separate "Add a task for tomorrow" button.
- The writing is formatted text: bold, italic, underline, strikethrough, headings, bulleted and numbered lists, checklists, quotes and links. The writing area is large, and can be opened full screen for easier typing.
- One entry per day. Each entry summarizes that day's activity.
- **Save status** (like Google Docs): next to the day's heading, a small status always shows where my writing stands: "Saving…" while I type and it's being stored, "✓ Saved" once it's stored and uploaded, and "Saved on this device, will sync when online" when it's waiting for a connection. The same status shows while editing an earlier entry, and also just below each writing box (the day's writing and "How to make tomorrow better?"), so it's visible on a phone wherever I'm typing.
- The order on the page: the day's stats, then **"Was today better than yesterday?"** with **Yes** and **No** to choose (or leave unanswered; tapping the chosen answer again clears it), then the writing ("Tell me about it"), then **"How to make tomorrow better?"**, then tags. The answer can be changed later, including on past entries.
- **"How to make tomorrow better?"** is its own box, formatted like the main writing (same editor and toolbar) and **the same size**, saved as I type, and editable later like the rest of the entry.
- Past entries ("Earlier") are shown 3 days per page, newest first, with the shared page control.
- The day's stats are added to the entry automatically:
  - tasks done (x of y due that day),
  - habits kept (x of y scheduled that day),
  - routines (how far I got in each scheduled routine, as a percentage of steps),
  - priority habits and priority tasks completed,
  - streaks reached or broken that day,
  - quests completed.
- Stats are shown visually so they can be read at a glance (progress rings and bars, check marks, small chips), with as little text as possible.
- Stats stay live while the day is open and freeze at midnight (my timezone). The writing stays editable at any time, including past days.
- **Missed days are logged for me, if I did something:** when a day ends without an entry, the app creates one on my behalf with that day's stats and no writing, marked as written by the app, but only if I completed something that day (a task, habit, routine step, priority item or quest). A day with no activity gets no entry. I can open an entry later and add my own words.
- **Optional journal reminder:** on the Account page I can set a time each day to be reminded ("Past you asked that you journal today."), or turn it off (the default). It is not sent if I already wrote something that day, and it respects quiet hours.

### The Vault
- User-defined buckets of things to remember that are not tasks (restaurant reviews, places to go, books, shows, ideas to research, shopping list).
- New accounts start with three buckets: Shopping list, Restaurant reviews, and Places to go. They can be renamed or deleted like any other bucket.
- The Vault page (in the menu) lists my buckets; opening one shows its items, with a quick box to add an item (title only needed). Buckets can be added, renamed and deleted. Everywhere buckets are listed (the Vault page, Capture's bucket choice, the Dashboard), **starred buckets come first, then the rest, each group A to Z** by name (there is no manual ordering). Deleting a bucket that has items deletes its items too, after a confirmation that says how many will be deleted.
- A bucket can be **starred** as a favorite (any number of buckets). Each starred bucket gets a card on the Dashboard that links to it and shows its 3 newest items.
- Each item has a title and optional notes, an optional **star rating** (1–5), an optional **link or address** (a web link opens in a new tab; anything else opens in maps), and tags. Items can be edited and deleted (after confirming). Each item in a bucket's list has its own delete button (a trash can), which asks before deleting.
- **Item editor layout:** Title, then Notes; More details holds the rating, the link or address, and the bucket (to move it).
- A bucket can be set so its items can be **checked off** (the Shopping list starts that way). Checked items move to the bottom, and "Clear checked" deletes them after confirming.

### Forms
- **Spacing (2026-11-11, user):** form sections are 32 px apart (`gap-8`), inside fold-outs too, and every field title (label, legend or heading over a field) has 8 px below it (`pb-2`).
- **Open fold-outs stand out (2026-11-11, user):** when a fold-out (More details, Reminders, Schedule, Attendees, the Account page groups) is open, its header gets a soft accent tint, so it's clear where the section starts. Only that fold-out's own header changes; a closed one inside an open group stays plain.
- **More details:** a form keeps the main fields in view and puts optional extras in a **More details** fold-out with a one-line summary of what's inside. It opens by itself when something in it is already filled in, so nothing set is ever hidden. It's a real disclosure control (keyboard and screen readers). **Never for just one item:** a single optional field is shown in view instead. **Notes are never inside it:** notes, details and descriptions are always in view. So today only the task editor (Priority, tags) and Vault item editor (rating, link, bucket) have one; Capture and the habit, event, routine, quest, priority task and bucket editors don't (the event editor has Schedule and Attendees fold-outs instead).
- **Formatted notes:** task notes, Vault item notes, quest details, priority task descriptions and event notes use the journal's formatting editor (smaller), like Post Its. Notes written before this show as paragraphs. Formatted notes are cleaned before they're shown (§8); search reads only their words; calendar files (.ics) get them as plain lines.
- **Dates and times are shown one way everywhere:** a day is "Tue, Nov 10" (the year added only when it isn't this year), a time is the device's way ("3:00 pm" or "15:00"), a day with a time is "Tue, Nov 10 · 3:00 pm", and when something happened (alerts, links) is just the time if today, otherwise the day and time. Messages sent to other people keep their written-out form ("Tuesday, November 10 at 3:00 pm").

### Date fields
- Every date field (task and priority task dates, habit start, event start and end, availability exceptions, filing an orphan as a task) works like the time fields. **On a computer:** a box where I type a day ("tomorrow", "Fri", "next Friday", "Nov 20", "11/20", "2026-11-20", "in 3 days"; a day with no year means the next one coming) or click to open a month grid and pick one. In the grid the arrow keys move by day and week, Page Up and Page Down by month, Home and End to the week's ends, Enter picks, Escape closes just the grid; it has Today and (for optional dates) Clear. Something that isn't a day goes back to the saved day; days before an allowed start can't be picked. The chosen day shows as "Tue, Nov 10". **On a phone or tablet:** the device's own date picker.

### Time fields
- Every time field (reminder times, event start and end, availability, quiet hours, journal reminder) works the same way. **On a computer:** a box where I type a time ("8", "830", "8:30 pm", "6p", "18:00"; 1–11 without am/pm mean morning) or click to open a list of times every 15 minutes and pick one, like Google Calendar. The arrow keys open and move through the list, Enter picks, Escape closes just the list. Typing doesn't open the list. Something that isn't a time goes back to the saved time; an empty box means no time. Times show the device's way (8:30 am or 08:30). **On a phone or tablet:** the device's own time picker.

### Global search and tags
- Search opens as a window over the current page (like Capture), from a Search item in the menu and a search button in the phone header. It searches tasks, journal entries, vault items, quests, and events by title, notes and writing. Results are grouped by type, show what type each item is, and tapping one opens it where it lives (the task editor, the vault item, the quest, the journal day, or the event).
- Search runs on the copy of my data stored on the device, so it is instant and works offline. It ignores case and accents and matches every word I type, anywhere in the text.
- Tags can be added to **tasks, habits and routines** only, by typing a tag name (existing tags are suggested). Search also finds habits and routines by title. Results can be filtered by one or more tags; choosing a tag with no search words lists everything with that tag.
- Search only ever covers my own data.

### Tags page (built 2026-11-11)
- At `/tags`, reached from the **Tags** row on the Account page (not in the menus). Every tag, A to Z, with what it's on ("2 tasks · 1 habit"; "Not on anything" for an unused tag). Deleted tasks, habits and routines aren't counted.
- Tapping a tag opens **Search** already filtered to that tag.
- Each tag has an **Edit** button that opens its window:
   - **Rename:** the new name applies everywhere. Changing only capitals keeps the same tag. A real rename makes the tag for the new name and moves every item to it (tag ids come from their names, so a later tag with the old name can't overwrite it). If another tag already has the name, the window asks "There's already a tag called #house. Merge them?" with **Merge them** and **Keep editing**.
   - **Merge into another tag:** pick a tag; everything on this one moves to it (items that already have it aren't doubled), and this tag goes away.
   - **Delete tag:** it comes off every item; the items stay.
- Every change happens straight away with an **Undo** bar (SPEC §2 Calm by design), which puts the tags and their items back as they were.

### Features and Docs pages
- **Dropped (2026-11-11):** there are no public Features (`/features`) or Docs (`/docs`) pages, and none are planned (removed 2026-11-10, dropped for good 2026-11-11).

### Focus timer (Pomodoro)
- **Focus timer** in the menu opens a full-screen timer: a black screen with only the time counting down and a line saying what to do now, **"Time to work"**, **"Short break"** or **"Long break"**, plus the round ("Round 2 of 4").
- Standard Pomodoro: 25 minutes of work, then a 5-minute break; every 4th break is 15 minutes. It runs until I stop it.
- Controls: **Pause / Resume**, **Skip** (to the next part), **Minimize**, and an **✕** in the top right corner that stops and closes it.
- **Minimized**, it keeps going as a small pill in the bottom-left corner of every page showing the part and time left (for example "Work · 18:42"); tapping it opens the full screen again. It keeps time across pages, reloads and app switches (it works from the start and end times, not a ticking counter).
- When a part ends: a soft chime, a short vibration on phones, and, if I'm in another app, a notification ("Past you set a timer: time for a short break."). On a phone that's asleep the alert may only come when I open the app again.
- While the full screen is showing, the screen is kept awake. The timer lives on this device only (it isn't synced).

### Random Quest (boredom buster)
- A bucket of projects I want to do, each with details, estimated time, and energy level.
- The pick is random but **skips recently picked quests** and can be **filtered by time and energy available**.
- Display the chosen quest's full details, with buttons to accept, re-roll, or mark done.
- **Quests aren't one-time tasks:** marking one done logs the completion (`quest_logs`) and the quest stays in the list (out of In progress) to be picked again; the list shows how many times each was done ("Done 3 times"). The Journal, Dashboard and "How past you did yesterday" count completions.
- **Choosing myself:** each quest in the list has **Pick** (shows it as the picked quest, like a roll, and counts as a pick) and a **delete** (trash can) button that asks first, to clean up the list. Tapping its title edits it.
- **Page design:** calm and easy to scan. The energy and time filters are compact chips whose chosen option is a soft tint with a check mark (not solid green); "Pick a quest" is a normal-size button; the picked quest shows in a plain card with a thin accent edge; In progress and the list of quests are compact rows in one card, each with small grey labels for energy and time.
- **The list of quests** is sorted by effort, easiest first (Ugh, Fun, Needs setup, Medicated; quests with no energy set come last), then by time, shortest first, then by title. It shows 10 quests per page.
- **Energy levels**, least to most: **Ugh**, **Fun**, **Needs setup**, **Medicated**. Choosing an energy level offers quests that need that much energy or less.
- **Time buckets**: **30 min**, **2 hours**, **Half a day**, **A full day**. Choosing one offers quests that fit in that time or less.
- A quest with no time or energy set (for example one made by quick capture) matches any filter.
- Quests are added through Capture, not on the Quests page. Every new quest, including one filed from the inbox or converted from another item, starts as **Ugh** and **30 min** unless changed.
- **Recently picked** means the last 3 quests picked. If every matching quest is recent, the least recently picked match is offered instead of nothing.
- Accepting moves a quest to In progress, where it can be marked done; quests in progress are not offered by the picker (done ones are, since they're back in the list). Every pick counts toward `times_picked` and sets `last_picked_at`.

### Calendar and reminders
- Standard calendar view (month, week, day) similar to Outlook, with reminders and notifications. It **opens on the month view** on every screen size. The basic calendar (step 9) is a Calendar page in the menu showing:
  - tasks with a due date, as all-day items with their priority colour,
  - priority tasks on their days at their reminder time,
  - my own events.
- **Tapping an item never leaves the calendar:** a task, priority task or event of mine opens read-only in a window over the calendar (what it is, when, how it repeats, priority or reminder, notes), with **Edit**, which opens its editor, still over the calendar. An event I was invited to opens its invitation window as before.
- Events: tap a day or time, or "+ New event", to add one with a title, start and end (or all day), optional notes, repeat (never, daily, weekdays, weekly, every 2 weeks, monthly, yearly), and an optional reminder (at the start, or 5, 10, 15 or 30 minutes, 1 hour, or 1 day before). Events can be edited and deleted (after confirming; deleting a repeating event deletes the whole series). Event reminders are sent like other reminders (Web Push and ntfy, respecting quiet hours) and open the calendar on that day.

- **Event form layout (2026-11-11):** Title; Notes; then **Schedule**, a fold-out with All day, Starts, Ends, Repeat and Reminder (open for a new event; on an existing event it starts closed and its summary says when, for example "Tue, Nov 10 · 12:30 pm – 1:30 pm, every week"); then **Attendees**, a fold-out with who's invited and their answers first, then the ways to invite people (Contacts, type someone), then "Guests can see who's going". Attendees opens by itself when anyone is invited or waiting to be invited; its summary says "2 invited · 1 going". No More details.

- Everything below from Accounts and contact info through Cancelling an event or attendance is built after the Dashboard (see the build order). Only the basic calendar view is built earlier.

- **My people: a contact list I build myself.** In the event's People section I add a guest by typing their email or phone number (and optionally their name) and pressing **Add**; that form only adds, it doesn't search. When I **save the event**, everyone I typed is saved to **my people** (people removed before saving aren't); the same email (any case) or phone number (any formatting) is the same person, and a new name replaces the old one. A **Contacts** button opens a window listing **my people A to Z**, 10 per page, with a search box that filters as I type (by name, email or phone, ignoring case and phone formatting) and an **Add** button on each person. Adding someone keeps the window open so I can add more: they show as **Added** with **Undo**; people already invited to this event show as **Invited**. **Done** closes the window. With no one saved yet, the window says so and points to typing someone or the Account page. On the **Account** page, a **People** section lists my people A to Z (10 per page) where I can **add** someone (name optional, plus an email or phone number, checked like the invite form; someone already saved with that email or phone is said, not saved twice), **edit** a name, email or phone, or **remove** someone (with a confirmation). My people sync across my devices and work offline. When this was added, everyone I'd already invited by email or phone was saved to my people.
- **Inviting shows what happened at every step:** adding someone says so; after saving, a message says the invitations are ready and the sharing window opens to send each one from my email or messaging app (the app doesn't send texts or emails itself yet, see Phase 2); when I finish, a message says how many I shared. Invited people then show in the event with their answer.
- **A new event starts at a time:** "+ New event", or tapping a day, starts a timed event at the next whole hour, lasting an hour; tapping a time in the week or day view starts it there. **All day** is a switch I turn on when I want it. Turning All day off on an existing event fills in that next-hour time so the time boxes are never empty.
### Accounts and contact info
- At signup, every user provides an email address and a phone number. Google sign-in supplies the email; the phone number is entered in a short "one more thing" step after the first sign-in (existing accounts see it once too). Phone numbers start as unverified, because verifying them needs an SMS service; verification is added with the SMS decision in Phase 2.
- Each user chooses how they want to receive event notifications: email, text, or both. "Text" is sent as a push notification in the app, plus email if I chose both (automatic texting is not planned); the setting explains this.
- The phone number, notification choice and my two cancellation messages are on the Account page.

### Shared events and invitations
- When I create an event I invite people by typing an email address or phone number, or picking them from my people (Contacts). Finding other My Brain users by name is Phase 2 (see section 10).
- Matching a typed email or phone number to an existing account must not reveal whether that person has an account. Only connections (section 10) get invitations in the app; a typed email or phone of anyone else is a guest invitation, even if it belongs to an account.
- An invited app user gets the event on their own calendar (pending until they answer, shown with a dashed outline) and a push notification, and answers **Yes**, **Maybe**, or **No** from the event. A Yes stays on their calendar, a Maybe stays marked as tentative, and a No removes it. Invited events are read-only for invitees; only the creator can edit them, and edits show on every invitee's calendar. Invitees cannot suggest another time, because finding a time is handled by the availability check before the event is created.
- Guests without accounts receive an email (or text) with a secure link to answer Yes, Maybe, or No, so they never need an account. The link opens a simple public page showing the event's title, date, time and notes and who invited them, with the three answers and a way to message the host. The guest page has an "Add to my calendar" button that downloads a calendar file (.ics), and once email is turned on, invitation emails include the same file, so the event can be added to the guest's own calendar in one tap.
- Any invitee can send a message to the host or to the other attendees by email or text. They type the message at that moment (it is not a template), and it is sent to each person individually.
- If anyone answers No, the creator is notified by email or text, based on the creator's notification preference. Cancellation rules are in the Cancelling an event or attendance section below.
- App users also get push or in-app notifications. Emails are sent automatically from a server-side function using a free-tier transactional email service: **Resend** (free plan 3,000 emails a month, 100 a day, checked 2026-11), sending from a domain I own, bought at **Porkbun** (planned: `myadhdbrain.app`). Buying the domain and turning on Resend is a Phase 2 step. Until then, emails are queued and logged but not sent, and guests are reached through the one-at-a-time sharing flow below (email guests through my email app, phone-only guests through my messaging app), with their answer link in the message. Automatic texts depend on the SMS decision (see section 12); until then, a text to a guest with only a phone number uses the one-at-a-time flow in Cancelling an event or attendance.
- Log every notification sent (who, how, when, status). Only message guests when the creator explicitly invites or cancels (or an invitee writes to them), include a way to opt out (every email has a "Stop these emails" link; opted-out addresses are skipped), and rate limit invitations and other messages to other people to prevent spam: at most 25 people per event, 100 invitations a day, and 50 other messages a day per user.

### Cancelling an event or attendance
- **Who can cancel what:** only the creator can cancel the event for everyone. An attendee who cancels only drops their own attendance. In both cases, everyone else attached to the event (users and guests) is told, by email or text.
- Each event has a **Cancel and notify** button. After I confirm (the confirmation lists exactly who will be notified), it marks the event cancelled, or my attendance dropped, and notifies everyone. Nothing is sent unless I press it and confirm.
- **My cancellation messages:** each user sets up two cancellation messages in settings: one for when I drop out of an event, and one for when I cancel an event I created. The app provides a default for each when the account is created, and both are editable. They use double-brace variables such as `{{name}}`, `{{event}}`, `{{date}}`, and `{{time}}`.
   - Default when I drop out: "Hi {{name}}, I'm sorry, but I can't make it to {{event}} on {{date}} at {{time}}. Sorry for the short notice!"
   - Default when I cancel an event I created: "Hi {{name}}, I'm sorry, but I have to cancel {{event}} on {{date}} at {{time}}. Sorry for the short notice!"

- **Always individual:** the message is sent to each person separately, never as a group text. The variables are filled in for each recipient, so every copy is personalized (for example with that person's name).
- **Phase 1 texting (guests with only a phone number):** the app opens my phone's messaging app with one pre-filled message for one person. After I send it and come back, the app opens the next one, with a progress indicator such as "2 of 5", until everyone has been messaged. Emails, and push or in-app notifications to app users, are sent automatically. The same one-at-a-time flow is used for invitations and messages to guests who only have a phone number, and, until email sending is turned on (Phase 2), for guests with an email address too (it opens my email app with the message ready, one person at a time).
- Fully automatic texting (no extra taps) is not planned (dropped 2026-11-11); texts go one at a time through my messaging app.
- This action needs a connection. If I am offline, show it as pending and ask me to confirm again when I am back online, so nothing is sent late by surprise.
- The app shows who was notified and how, and logs each message (see Shared events and invitations).

### Dashboard
- The Dashboard is the first page the app opens on (Tasks moves to its own menu item), reached from "My Brain" in the header or side menu (see Navigation). It shows all of my stats at a glance, visually (big numbers, small bars and chips), updating live as I use the app.
- **Post Its** come first, above everything else. They look like a real sticky note taped to the page (a strip of tape at the top, a slight tilt, a soft shadow). With several, they sit in a **stack**, newest on top: only the top note is shown, with the edges of the notes underneath peeking out in their colors, and I flip through them: on a computer with **arrows** either side of the stack (‹ and ›, none past either end), which appear when the mouse is over the stack or the keyboard reaches them, with "2 of 5" below; on a phone by **swiping**, or tapping one of the **dots** under the stack (one dot per note, the current one highlighted; a tap is needed as well as the swipe for accessibility); the left and right arrow keys work too. It never moves on its own. Notes stay newest first (there's no reordering). On the note shown, an **edit icon** (pencil) in the bottom left corner edits it in place (same editor, and change its color), and an **X** in the top right corner deletes it (it comes off the Dashboard straight away, with **Undo** for a few seconds instead of a confirmation, since it's a scratch note). A new Post It goes to the front. Post Its don't appear in search. With none, nothing shows.
- **"How past you did yesterday"** comes next (on a wide screen, 1280 px and up, it sits to the left of the Post Its, and the Dashboard gets wider to make room; with no Post Its it takes the full width): yesterday's **habits kept** (x of y scheduled), **routines** (finished, x of y scheduled, a routine counting as finished when every step was done), **tasks done** (x of y due) and **quests done** (how many, with their names), in smaller numbers than the key stats, the same numbers the Journal records for that day, plus each routine yesterday with its steps done (for example Morning 4/5). With nothing scheduled yesterday it says so. Any badges I earned yesterday are listed too, each with its trophy icon and name. The period below doesn't apply to it.
- **What shows first:** Post Its, "How past you did yesterday", then three key numbers in a row (**Days since your worst day**, **Longest current streak**, **Best streak ever**), then the favorite Vault buckets, then Trophies. Nothing is shown twice: Days since your worst day is only here (not in the Journal box), and tasks done is only in More stats. Everything else below is in a **More stats** section that opens and closes (remembered on this device; closed to start).
- **Period:** a dropdown at the top chooses **This year** (the default, January 1 to today), **Last 12 months**, or **All time**. It applies to every count below; streaks are always counted over all time.
- **Habits:**
  - every habit with its current streak and its longest streak ever;
  - **Most missed:** the top 3 habits with the most missed days in the period (a habit is missed when its deadline passes without completing it; skipping its step in a routine doesn't count until the day is missed);
  - **Longest current streak:** the habit kept going the most days in a row right now;
  - **Best streak ever:** the longest streak any habit has reached;
  - **Oldest habit:** the habit I have been tracking the longest, since its start date.
- The Dashboard no longer has a notifications box: alerts live under the bell in the header (section 6, In-app alerts).
- **Journal:** my current streak and my best streak of days in a row with a journal entry I wrote (entries the app wrote for me don't count), and **Days since your worst day**: how many days in a row, up to today, I answered Yes to "Was today better than yesterday?" A No, or a day with no answer, resets it to zero; today without an answer yet doesn't break it until the day ends.
- **Favorite Vault buckets:** a card for each starred bucket, linking to it and showing its 3 newest items.
- **Events:** in the period, events I **created**, events I **attended** (dates that have passed of my own events and of invited events I answered Yes, not counting cancelled ones), and events I **cancelled** (events I cancelled for everyone or dropped out of, plus events I deleted).
- **Tasks, routines and quests:** in the period, tasks done, each routine's completion rate (or how many times a run-anytime routine was finished), and quests finished.
- **Trophies:** its own section after the favorite Vault buckets (not in More stats); what it shows is in §5 Trophies. Private to me.
- More stats and Achievements (section 10) may be added later.

### Celebrations (built 2026-11-11)
Finishing something should feel good. Each celebration plays right after my action, lasts about a second (the big ones about two), never covers a control or blocks the next tap, and is never sound.
- **Small, every time:**
  - **Task crossed off:** the check mark draws itself in and a small burst of confetti comes out of the checkbox.
  - **Habit done:** its progress ring fills and its streak number ticks up with a small bounce.
  - **Routine step done:** the existing cross-out, plus the routine's progress bar moving forward.
  - **Capture saved:** the Capture button gives one soft pulse.
  - **Journal saved:** a soft glow around the writing and a small "saved" stamp.
- **Bigger, finishing a set:**
  - **Last task of the day:** crossing off the last open task due today gives a bigger confetti burst across the screen and a "list cleared" message on the Tasks page.
  - **Routine finished:** when every step is done, the steps fold into one ticked badge beside the routine's finished message, with a bigger confetti burst. While it runs, a progress bar under "Step 2 of 5" moves forward with each step done.
  - **Focus session finished:** when a work part ends (not skipped), a soft ripple on the timer screen and the total focus time finished today on this device (the chime stays as it is).
  - **Orphans cleared:** filing or deleting the last orphan shows a friendly "all sorted" empty state.
  - **All habits done today:** completing the last scheduled habit of the day gives the biggest confetti. The **next day**, the first time I open the app, I get a congratulations alert (bell and banner, §6 In-app alerts); it isn't pushed and works offline. Yesterday is checked when the app opens and again once that visit's download finishes, so habits ticked on another device count. It counts as a **perfect day**.
  - **Comeback:** doing a habit on its first scheduled day after missing it 2 or more scheduled days in a row shows a "welcome back" message instead of anything about the lost streak.
- **Badges (first times):** a one-time badge, with a small burst and a message, the first time I: cross off a task, complete a habit, finish a routine, write a journal entry, save to the Vault, finish a quest, finish a Focus session, make a Post It, sort an orphan, and create a shared event. Earned badges are kept (synced, with the day earned) and shown in **Trophies** on the Dashboard. Badges my history already shows (tasks, habits, routines, journal, Vault, quests, Post Its I did before this was built, or on another device) are awarded quietly (no celebration) once this device has downloaded my data; orphans, Focus sessions and shared events leave no history, so those badges come the next time. A badge earned before my badges have downloaded waits for them, so one I already have is never celebrated twice. **Delete my data** leaves badges alone (like my settings); Delete My Account removes them.
- **Messages:** every celebration message is in the messages file in the "past you" voice; the user writes the playful lines.
- **Setting:** **Celebrations** in Account Settings on the Account page, saved with its own Save: **Full** (default), **Gentle** (no confetti or bouncing; a soft glow or fade and the message only) or **Off** (no animation; messages and badges still happen). If the device's reduce-motion setting is on, Full acts as Gentle. Saved to my profile, so it follows me to my other devices (and kept on this device, so it works offline).
- **Accessibility:** animations are decorative (hidden from screen readers); each message is announced in a polite live region. Confetti never flashes more than 3 times a second (WCAG 2.3.1).
- **Not included (for now):** sounds (never), weekly summaries and heat maps. Streak and other milestone trophies are in Trophies below.

### Trophies (built 2026-11-11)
Trophies give me things to work toward and a little dopamine for using the app. They reward what I did and never shame me: nothing is ever taken away, and nothing rewards unhealthy habits.

- **Tiers:** most trophies have levels. A trophy moves up through **Bronze, Silver, Gold, Platinum, Diamond, Legendary** (as many as it has levels; a one-level trophy is just earned). Each new level is celebrated like a badge (a small burst and a message, following the Celebrations setting).
- **Never taken away:** streak trophies count my **best** streak, so missing a day never loses a level.
- **From my history:** trophies are worked out from the history the app keeps, so earlier activity counts, and a trophy added later is awarded straight away to anyone who already did it. The first time trophies are worked out on a device, any earned from the past are awarded quietly and I get **one** in-app alert (bell and banner, §6) "Past you already earned 12 trophies", which opens Trophies on the Dashboard, instead of a burst for each (an alert, because a celebration message can't be tapped). Focus sessions, captures and emptying Orphans weren't recorded before this, so those count from the day trophies are built.
- **Streak levels:** 3 days, 1 week (7), 1 month (30), 2 months (60), 6 months (182), 1 year (365). For a habit or routine that isn't daily, a day means one of its scheduled days (7 Thursdays in a row is "1 week" for a Thursday-only habit).
- **Total levels:** 10, 50, 100, 250, 500, 1,000.

**Categories and trophies** (names are plain placeholders; the user writes the playful ones):

1. **Firsts:** the ten first-time badges from Celebrations, unchanged (one level each).
2. **Streaks** (streak levels):
   - **Habit streak:** my best streak on any one habit.
   - **Journal streak:** days in a row with a journal entry I wrote (entries the app wrote for me don't count).
   - **Routine streak:** the same routine finished on its scheduled days in a row (run-anytime routines don't count).
   - **Perfect-day streak:** perfect days in a row (every scheduled habit done; days with no habits scheduled don't break it).
   - **Good days:** my best run of days since a worst day (the Dashboard's "Days since your worst day").
3. **Totals** (total levels):
   - **Tasks created**, **Tasks completed**
   - **Habits created**, **Habit check-ins** (each completed habit day)
   - **Journal entries** (written by me)
   - **Routines finished**
   - **Quests finished** (each time, from quest_logs)
   - **Vault items saved**
4. **Brain dumps:**
   - **Brain dump:** 10 thoughts captured in one day (anything saved from Capture).
   - **Orphan wrangler:** emptied the Orphans list 5 times (Bronze), 25 times (Silver).
   - **Tried everything:** used every Capture type at least once (shows "x of 6").
5. **Focus:**
   - **Full cycle:** 4 Focus sessions finished in one day.
   - **Focus days:** finished a Focus session on 5, 20 and 50 different days.
   - **Focus hours:** 10, 50 and 100 hours of finished Focus work in total.
6. **Perfect days and weeks:**
   - **Perfect days:** 1, 10 and 50 perfect days in total.
   - **Perfect week:** every scheduled habit, every day, Sunday to Saturday (like the calendar).
   - **Perfect month:** the same for a whole calendar month.
   - **Perfect year:** the same for a whole calendar year.
7. **Boredom busters (Quests):**
   - **Every energy:** finished a quest at each energy level (shows "x of 4").
   - **Quest month:** 10 quests finished in one calendar month.
8. **Taking care of myself** (priority tasks and priority habits, like meds):
   - **On it:** a priority reminder marked done on its day (snoozes are fine), 7, 30 and 100 times in a row that it was due.
   - **Full month of care:** one priority habit done on every scheduled day of a calendar month.
9. **Reflection:**
   - **Words written:** 1,000 and 10,000 words in my journal in total.
10. **Time-of-day fun** (one level each):
    - **Early bird:** a habit or task done between 4 and 7 am (so staying up all night never earns it).
    - **Weekend warrior:** at least one task done on both the Saturday and the Sunday of one weekend.
    - **Monday, handled:** at least one task due on a Monday, and every task due that Monday done.
11. **Getting organized:**
    - **Organized:** 5 Vault buckets (the 3 starter buckets count).
12. **Events:**
    - **Adulting:** 4 or more events in one calendar month that I created or said Yes to, with none of them cancelled.
13. **People:**
    - **Making friends:** 5 connections. **Social butterfly:** 10 connections (connections ever made; checked on the server, since connections live there).
14. **Surprises** (hidden: shown as "???" until earned):
    - **That was fast:** a task done within a minute of making it.
    - **Just in time:** a task done between 11:50 and 11:59 pm on the day it was due.
    - **Protecting your boundaries:** blocked a connection.
    - **A healthy brain:** reached the 1-week level on every streak trophy.
15. **Anniversaries:** 1 week, 1 month, 6 months and 1 year since my account was made (Bronze to Platinum).

**Where they show:**
- The Dashboard's **Trophies** section keeps its place and shows my 3 newest trophy levels earned (icon, name, level, day earned) and how many trophies I have. Perfect days aren't shown there as a number (2026-11-11, user): they're a trophy. **Tapping an earned trophy** opens a window saying what I did to earn it ("You kept one habit going on its days in a row."), with each level, what it needed and the day I reached it (or just the day, for a one-step trophy). Locked trophies can't be tapped.
- **See all trophies** lists the trophies I've earned or started, **grouped by category**, each with its current level and progress to the next where it can be counted ("7 of 14 days", "38 of 50 tasks").
- A **See locked trophies** button opens a window with the trophies I haven't started, greyed out, by category. Surprises show only as "???".
- Private to me.

**Comebacks (messages, not trophies):** a friendly celebration message at the moment (it fades by itself, like other celebrations; nothing is kept in the bell), when I:
- restart a habit after missing it (its previous 2 or more scheduled days missed, as in Celebrations);
- open the app after 7 or more days away;
- write a journal entry after a gap of 2 or more days;
- finish a task that carried over 3 or more days;
- finish an Undated task older than 30 days.

**Sync status:** the activity log uploads quietly; it isn't counted in "waiting to sync".

**Data:** earned trophies are kept in **badges** with a level (`tier`; empty for Firsts), one row per trophy, the id made from my user id and the trophy, so every device writes the same row; moving up a level updates it, with the day each level was earned. A new **activity_log** (kind, when, detail) records what the app didn't keep before: finished Focus sessions (with their length), captures (with their type) and emptying the Orphans list. Trophies are defined as data (id, category, levels, rule) so new ones can be added without restructuring.

## 6. Notifications
- Support both Web Push and ntfy, selectable in settings.
- A scheduled server-side job finds due reminders and sends them. **Decision: Supabase Cron (pg_cron)** runs a check inside the database every minute; ntfy messages are sent straight from the database (pg_net), and a Netlify Function is called only when a Web Push is due, to sign and send it. Limits: one-minute resolution; Supabase pauses free projects after a week without activity (prod is used daily); pg_net calls are asynchronous, so failed pushes are cleaned up on the next run.
- Android is my phone, so test on Android Chrome installed as a PWA.

- Quiet hours (notifications are held until they end) and snooze options on reminders and routine prompts. Priority tasks are exempt from quiet hours unless I choose otherwise.
- **In-app alerts:** every notification the app sends me (reminders for habits, routines, priority tasks, events and the journal; event news; connection requests and acceptances) is also an alert inside the app, whether or not "Notify this device" or ntfy is on. A **bell** in the header, on every page, shows how many alerts I haven't dealt with (a number badge, hidden at zero; "9+" past nine). Tapping it opens my alerts, newest first, 5 per page, each with its title, text and time; new ones stand out. With no alerts, tapping it opens nothing: a short **"All caught up."** message appears and fades by itself (2026-11-11, the user's choice; an empty list felt negative). Tapping an alert takes me where I deal with it (its link) and counts it as seen; **✕** clears one and **Clear all** clears them all. The count goes down one at a time, as I tap or clear alerts (the user's choice). A priority reminder sent again counts as new again. Alerts are kept for **7 days**, then removed. **While the app is open**, a new alert also slides in as a **banner** at the top of the screen with its title and text: tapping it goes to its link (and counts it as seen), ✕ closes it, and it hides after **8 seconds** unless the mouse or keyboard is on it. Screen readers hear it (a polite live region). Several at once show one after another. Alerts sync across my devices, so seeing one on my phone counts it as seen on my computer too.
- Each device (phone, laptop) registers its own push subscription. Remove stale subscriptions when the push service reports them invalid.
- Reminder timing is critical, and it must respect each user's timezone: reminder times are local times in the profile's timezone, which the app keeps in step with the device.

## 7. Offline and sync
- Reads come from the local store first; writes are applied locally and queued.
- Sync on reconnect and via Realtime; resolve conflicts simply: **the last edit to reach the server wins** (the server sets `updated_at` on arrival). An older offline edit that syncs late can overwrite a newer edit from another device; this is accepted for Phase 1.
- Show a small online/offline/syncing indicator.
- **Catching up and not leaving changes behind.** Coming back to the app (opening it, or switching back to it) uploads anything queued and pulls what changed, because Realtime misses changes while a device sleeps. Switching away from the app saves anything waiting to be saved (such as writing saved on a short timer) and uploads it straight away, because a phone may stop a hidden app. Changes still queued are retried every 30 seconds while the app is open, since a dropped request on a weak signal doesn't count as going offline.

- Deletions are soft deletes (a `deleted_at` value) so they sync to other devices, and `updated_at` is set by the server rather than the device clock.
- Actions that notify other people (cancelling, declining, invitation messages) need a connection. If I am offline they show as pending, and I am asked to confirm again when I reconnect, so nothing goes out late by surprise.
- Sync layer: a simple custom queue on Dexie (IndexedDB). Record ids are generated on the device, so retried uploads never create duplicates. Changes are pulled by `updated_at` since the last sync, plus Realtime for live updates. A change the server refuses is kept and retried on every sync (app start, reconnect), never dropped. Evaluated and rejected: RxDB (free tier allows only 13 open collections; paid from $99/month) and PowerSync (extra service and account, free instances deactivate when idle, harder for Pi device pairing).

## 8. Auth and security
- Google sign-in through Supabase Auth.
- Row-level security on every table. Never expose service keys in the front end; keep secrets in Netlify environment variables.
- **Everything people type is untrusted** (security sweep, 2026-11-07). The rules:
  - **Shown as text, never run as code.** Typed text is displayed as plain text everywhere (Vue escapes it). Formatted writing (journal, "tomorrow", Post Its) is cleaned with DOMPurify to the editor's own formatting before it's shown: no scripts, event handlers, styles, frames or forms; the only input kept is a checklist box; links may only be web, email or phone links and open safely in a new tab. A Vault link that isn't a web address opens a map search, so it can never be a script.
  - **Security headers** on every page (`public/_headers`, also sent by the test server so every browser test runs under them): a strict Content Security Policy (scripts only from the app itself, no inline scripts, connections only to the app and Supabase, pictures only from the app and Google profile photos, no framing, no plugins), plus nosniff, no framing, a strict referrer policy, HTTPS only, and camera/location off (microphone allowed for the Capture speech button).
  - **Size limits on the server** for every text column people type into (titles 500 characters, notes 20,000, names 120-200, journal writing 200,000), matched by limits on the inputs. A title that's too long when filing moves the rest into the notes.
  - **Addresses:** profile pictures and push addresses must be https; push is only ever sent to real browser push services (Google, Mozilla, Apple, Microsoft), so a stored address can't make our server send requests elsewhere. The push sender checks its shared secret in constant time and handles at most 50 devices per call.
  - **Database:** every query is parameterized (no SQL is built from typed text); every table has row-level security; server functions run with a fixed search path and check sizes, permissions and rate limits; people search ignores wildcard and escape characters.
  - **Other:** calendar files escape every kind of line break and quote names; redirects only go to pages inside the app; tapping a notification only opens the app; secrets stay in environment variables and Supabase Vault.
  - **Tests:** `src/tests/e2e/security/security.spec.ts` (headers, no blocked resources on any page, script-injection attempts in every place typed text is shown, including the public guest page), `src/tests/unit/security/security.test.ts`, and `src/tests/db/rls_security.sql`.
  - **When email arrives (Phase 2):** email bodies must HTML-escape everything typed (names, titles, messages), and subjects must strip line breaks.

- Before anyone other than me uses the app (the Phase 2 social features), build: a data export of all my data (JSON or CSV), account deletion that removes everything, privacy policy and terms of service pages, and rate limits on invitations and any message sent to other people. Texting people also has consent and compliance rules; verify them before enabling it.
- **Built in step 11:** "Download my data" on the Account page saves one JSON file with everything I own. **"Delete my data"** next to it lets me start fresh without deleting my account; it is shown in an **orange warning colour** (its button, box and confirmation), while red stays for errors and Delete My Account. The confirmation is a checklist of what to delete, all ticked to start: tasks, inbox, quests, The Vault (the three starter buckets come back), journal, habits (with their history and streaks; a habit used as a routine step is removed from that routine), routines (with their history), priority tasks (with their history), tags, my own events (except events I've invited people to, which are always left alone), Post Its, and my people. I untick anything I want to keep, the confirmation shows what stays, and I type DELETE. Only the ticked parts are permanently removed, along with their reminder state and the tags on them. It keeps my account, profile and all settings, my availability times, invitations I received, and the log of messages I sent. My other devices clear their copy and download again the next time they open or come back to the app. Privacy policy and terms pages are public (linked from the sign-in page and the Account page). Claude drafts them in plain language from how the app actually works; they are a starting point to review, not legal advice. Account deletion was built earlier (Delete My Account) and now also removes invitations I sent; invitations I received are deleted, and their hosts see me as removed.

## 9. Raspberry Pi dashboard display
- **Dropped (2026-11-11):** no Pi display, device pairing or kiosk mode is planned.

## 10. Phase 2 (do not build yet, but don't block it)
- **Connections (being built in parts; approved by the user 2026-11-08). Part 1 is built: asking by email or phone, answering (Accept, Decline, Block), the Connections page (linked from the Account page and the Contacts window), connections listed first in Contacts under "On My Brain" and invited in the app, Remove and Block, the request limit, and a Connections part in Delete my data. Requests show in Today's notifications; a push for them comes with a later part. Part 2 is built too: connect links and codes (24 hours, one person, cancel early, 5 at a time, 10 code tries an hour; a link opened before signing in comes back after sign-in). Part 3 so far: Connect on saved people with accounts (Account page and Contacts window) and "Connect with [host]?" on the guest page for a signed-in account holder after answering Yes or Maybe. Part 3 also has who's going: invitees see the host, other attendees who chose to be visible (with Connect) and guests by first name; the host's "Guests can see who's going" (on by default) and each attendee's "Show me to other guests". Part 4 is built: guest links stop working 30 days after the event (a year after the last answer for a repeating one) and the page says it has passed; the guest page offers to create an account and comes back after sign-in; a signed-in account whose email was invited gets the invitation moved in on its own, a different account is asked "Accept as me?" or can answer as a guest; the host can send a guest a new link (the old one stops); when two people connect, earlier guest invitations between them move into the app; changing an event's date or time offers "Let everyone know?" (push to app users, one-at-a-time messages to guests); a deleted event or host says the invitation is no longer available. Part 5 is built: scheduling for connections (weekly and one-off availability on the Account page, "Share when I'm free or busy", free or busy and up to 3 suggested times when inviting connections; free/busy is only ever shared between connections). Not built yet: a push for connection requests (they show in Today's notifications). "Just this date" answers for repeating events were dropped (2026-11-11): an answer always covers the whole series.** My Brain is not a social network. No one can find another user unless they already know them, and two users can only invite each other, see each other's profile, or use the scheduling feature once **both have agreed** they know each other.
  - **Asking to connect by email or phone.** On a **Connections** page (linked from the Account page and the Contacts window) I type someone's exact email address or phone number and send a **connection request**. There's no browsing or searching by name, and no partial matches. Whatever I type, the app always answers the same way ("If they use My Brain, they'll get your request"), so it never reveals whether that email or phone has an account. If it matches a user, they get the request in the app (Today's notifications and a push, if they allow push); if not, nothing happens and nothing is stored about them.
  - **Answering a request.** The other person sees my display name and avatar and chooses **Accept**, **Decline** or **Block**. Declining isn't shown to me: my request just stays "Sent" until it expires after 30 days (so I can't tell a decline from an ignore or from no account). Blocking also stops any future requests from me, silently. Requests I've sent are listed with **Cancel**.
  - **Connecting by link or code.** On the Connections page I can make a **connect link** (and a short **code**, 8 letters and numbers, easy to read out) to share however I like. It works for **24 hours** and for **one person**, and I can cancel it early. Someone signed in who opens the link or enters the code sees my name and avatar and taps **Connect**; since I shared it, that connects us straight away (no second step), and I get a notification. Opening an expired, used or cancelled link says it no longer works. Someone not signed in is asked to sign in first and then continues. Codes are random and rate limited, so they can't be guessed.
  - **Once connected:** we each appear in the other's **Contacts** (with a "On My Brain" mark) and can invite each other to events, which then arrive in the app (on their calendar, with a push), as invitations to app users do today; we can view each other's **profile** (what a profile shows will be decided after connections work); and the **scheduling feature** comes back for connections only: each user sets weekly available or unavailable times and one-off exceptions; when creating an event the app checks connected invitees' free or busy times (never titles or details), shows who's free, and suggests up to 3 times when everyone is free (same length, next 14 days, 8 am to 9 pm), without blocking the event; each user can turn off sharing their availability.
  - **Ending a connection.** Either of us can **Remove** the connection (we drop out of each other's Contacts; existing events and invitations stay as they are) or **Block** (remove, and no more requests or links from them). Neither is announced to the other person.
  - **Typed emails and phone numbers stay private.** Inviting someone by typing their email or phone keeps working for anyone, connected or not. If they're not a connection, they're treated as a guest (email or text with the private answer link) even if they have an account, so typing an address never puts something in a stranger's app.
  - **Limits, against spam and guessing:** at most 20 connection requests a day, at most 5 active links or codes at a time, and code entry limited to 10 tries an hour per user. Requests, links and codes are only ever created and read through server functions with row-level security; nothing about a request is visible to anyone but the two people involved.
  - **Data:** connection requests (from, to, status, created and answered times, expires), connections (the two users, since when), blocks (who blocked whom), and connect links (owner, hashed token and code, expires, used by, cancelled). All follow the usual columns and RLS. Delete my data and Delete my account remove them; deleting an account ends its connections.
  - **Guests without an account** keep answering from their private link, with no account needed: the link opens the event page (title, date, time, notes, who invited them), where they answer Yes, Maybe or No, can come back to the same link to see the latest details or change their answer, and add it to their calendar. The page also offers, without pushing, **"Keep track of your plans: create a free My Brain account"**. If they create one (or sign in) from that page, the invitation moves into their account and the event appears on their calendar; the guest link then just opens the app.
  - **Seeing who else is going (account holders only):** on an event I'm part of, I see the other attendees who have accounts and **chose to be visible** to the event's other attendees (a per-event choice, off for guests; account holders are asked once per event, default visible), each with **Connect** to send a connection request through the event (they see "Allie, from Birthday party, wants to connect"). Their email and phone are never shown. Guests appear by name only, with no way to contact them. Anyone I've blocked, or who has blocked me, isn't shown to me and doesn't see me.
  - **An account holder invited as a guest** (the host typed an email or phone and didn't know): when they open the guest link while signed in, or sign in from the event page, and accept, they're offered **"Connect with [host]?"**. If they say yes, the host gets a connection request (or they connect straight away, since the host invited them; see open questions). If not, they stay a one-time guest of that event: the event shows on their calendar, but neither ends up in the other's Contacts or my people, and nothing else about them is shared with the host.
  - **Proposed answers (from how Google Calendar, Partiful and similar apps work; awaiting the user's OK):**
    - **Forwarded guest links:** like Google Calendar, whoever has a guest's link can answer as that guest, so the page says "This invitation is for Carol", and the host can **send Carol a new link**, which stops the old one working. No device locking, since that adds friction for real guests.
    - **Signed in with a different account:** if my account's email matches the invitation's email, it moves into my account. If not, the page asks "Accept as [my name]?" with "Answer as a guest instead". Phone numbers aren't verified yet, so phones never match automatically.
    - **"Connect with [host]?" after accepting a guest invite:** sends a connection request the host must accept, labelled "from your Birthday party guest", so both people always agree, as with every other connection.
    - **Invitations sent before connecting:** once two people connect, any guest invitations between them move into the app (both have agreed now).
    - **Repeating events:** an answer covers the whole series, for guests and account holders alike ("Just this date" was dropped 2026-11-11).
    - **Changes to an event:** like Google's "Send update emails to guests?", changing the date, time or place asks the host "Let everyone know?" (guests are messaged one at a time until email sending is on; account holders get a push). Changing only notes or the title doesn't ask. The guest page always shows the latest details.
    - **How long guest links work:** until 30 days after the event (for a repeating event, after its last date, or a year from the last answer). After that the page says the event has passed.
    - **Event or host gone:** a cancelled event's page says it was cancelled, with the host's message; a deleted event or account says the event is no longer available.
    - **Who's going:** like Partiful, the host chooses whether attendees can see who else is going (on by default), and each attendee can hide themselves from other attendees. Guests show by first name only.
  - **Saved people who have accounts:** anyone in my people whose email (or, once phones are verified, phone number) belongs to a My Brain account, now or when they sign up later, shows a **Connect** link in my Contacts and on the Account page. Tapping it sends their account a connection request (labelled "from [my name], who has you in their contacts"), handled like any other request. This knowingly shows me that they use My Brain before they've agreed (the user's choice); it's limited to people I already saved by their exact email or phone, never by name. Someone who has blocked me never shows Connect.
  - **Still open:** what a profile shows (later).
  - The old "find people by display name" search is dropped in favour of this. The availability tables and server functions built in step 11 are kept and reused for connections.
- **Email sending:** buy the domain at Porkbun (planned `myadhdbrain.app`), point it at Netlify (the app can then live there too), verify it in Resend, and turn on automatic emails for invitations, answers, messages and cancellations, with the calendar file attached to invitations. Until then, step 11 queues and logs emails and uses the one-at-a-time sharing flow.
- **Home Assistant** (pre-installed on my linknlink device) as the integration layer: webhooks and REST calls to and from the app.
- **Alexa/voice** to add items and hear reminders, likely via Home Assistant. Verify current requirements and costs before committing.
- **Smartwatch:** start by forwarding notifications to the watch; native watch apps come later.

- **Achievements:** objectives that reward me for using the app and keeping up my routines and streaks. Earned achievements appear as badges on the Account page (respecting my visibility setting) and are celebrated when earned with a small in-app moment and an optional notification. Examples: journal 5 days in a row; reach a 7-day or 30-day habit streak; complete a routine 10 times; finish every task in a day; beat my best streak; capture 25 thoughts; try a Random Quest. Claude Code and I will brainstorm the full list together before building this.
- Design for achievements now: define them as data (id, title, description, rule type, threshold) and calculate them from existing history, so new ones can be added without restructuring the app. Phase 1 must keep full completion histories (habit logs, routine step logs, journal dates, task completions) so achievements can be calculated retroactively. Store earned achievements per user with the date earned. Achievements that come from private habits are never shown to other users.

### Phase 3: iPhone support (started 2026-11-08: the installed web app; a native app only if this falls short)
- **The app stays a web app on iPhone** (installed with Share → Add to Home Screen; iPhones never offer an install prompt). A Capacitor App Store app (Apple Developer Program, $99 a year, and a Mac for builds) is only considered if the web app falls short in real use.
- **Tested on Safari's engine:** the browser tests also run as an iPhone (Playwright's WebKit "iPhone 14"), so every change is checked against Safari. A final pass on a real iPhone is done by the user.
- **Opens like an app:** the page asks iOS to open it full-screen from the Home Screen, with the status bar over the app and room for the notch and home bar.
- **Texting guests:** iPhones need the message link written as `sms:NUMBER&body=…` (Android uses `?body=`), so the one-message-at-a-time flow fills in the text on both.
- **Offline data kept:** the app asks the browser to keep its stored data for good (Safari can otherwise clear a website's data after weeks unopened); synced data comes back from the server either way.
- **Reminders:** web push works on iOS 16.4 and later **only after adding to the Home Screen**, and is turned on from inside the installed app. On an iPhone in Safari (not installed), the Reminders setting explains this instead of saying the browser can't do it. In-app alerts (bell and banner) and the ntfy iPhone app work either way. A priority reminder can't take over the screen on iOS; it arrives as an ordinary notification.
- **Not on iPhone:** sharing text or links into Capture from other apps (iOS doesn't let web apps into the Share sheet); paste into Capture instead.
- To check on a real iPhone: Google sign-in returning to the installed app, voice capture, and that push reminders arrive.

## 11. Suggested build order
1. Repo, Vue + Vite + TypeScript + Tailwind scaffold, Vitest and Playwright set up with a first passing test, GitHub Actions, Netlify deploy, dev and production Supabase projects, Google sign-in, schema with row-level security. Start by walking me through creating the accounts in section 13.
1. PWA shell with offline storage, sync queue (with soft deletes), and quick capture (task, vault item, quest, or decide later), including voice-to-text. First milestone: capture works from my phone and laptop, even offline.
1. Tasks with carry-over, red text, cancel/edit, scheduling, priorities, "past you" voice.
1. Random Quest picker (quick win).
1. Habits with streaks, best streak, timer misses, private habits, and the Account page that displays them.
1. Routines and completion stats.
1. Notifications (Web Push and ntfy, quiet hours, snooze) and priority task full-screen reminders.
1. Journal with auto stats.
1. The Vault buckets, global search and tags, and the basic calendar view.
1. Dashboard with all my stats.
1. Shared events: contact info at signup, invitations, RSVPs, cancellations and notifications, and the availability schedule. Data export, account deletion, privacy policy and terms, and rate limits must be in place before anyone other than me uses the app.
1. Phase 2 integrations.
1. Phase 3: iPhone support.

After each step, the app should deploy and be usable, and all Vitest and Playwright tests must pass.

## 12. Questions for Claude Code to confirm with me before or during the build
- The "past you" voice is decided (see Voice and tone in section 2). Ask me if a new kind of message isn't covered.
- Recurrence options for tasks, reminders, and priority tasks (daily, weekdays, weekly, custom).
- Which stats to show on the dashboard and in journal entries.
- Anything in this document that conflicts with current platform limits; flag it rather than silently working around it.

- Email service for notifications (free tier, open source preferred), and whether phone numbers should be verified at signup (which needs an SMS service).

- Evaluate and recommend, but do not build without my approval: attaching an `.ics` calendar file to invitation emails so events land in guests' calendars, and a private `.ics` subscription feed so Google, Outlook, or Apple calendars can follow my events without needing Google's API verification.

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
- **Home Assistant and Alexa** (Phase 2): Home Assistant is already running on my linknlink device, so ask me for its URL and a long-lived access token when we get there. Alexa needs an Amazon developer account (https://developer.amazon.com).
- **Domain name:** none for now (decided 2026-11-06). The app uses its free Netlify address, https://myadhdbrain.netlify.app. Revisit before choosing the email service (shared events build step) and before Google's OAuth verification for a public app, since both work much better with an owned domain.

## 14. Decisions

The decisions list lives in [docs/DECISIONS.md](DECISIONS.md) (moved 2026-11-10 to save tokens). Add new decisions at the end of that file. References to "§14" mean that file.
