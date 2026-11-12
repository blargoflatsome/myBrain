// Shared Tailwind class lists, so every screen's controls look and behave the same (docs/CODING_STANDARDS.md).
// Field borders get their contrast colour from style.css (WCAG 1.4.11), whatever border class is used here.

/** A text box, list or date field inside a card or window. */
export const field = 'min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-base text-ink'
/** The same, straight on the page background. */
export const fieldOnPage = 'min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink'
/** A field's label wrapping its title and the field, stacked. */
export const fieldLabel = 'flex flex-col gap-1 text-sm text-muted'
/** A checkbox drawn in the accent colour. */
export const checkbox = 'size-5 shrink-0 accent-[var(--accent)]'
/** A slightly smaller field for dense forms (availability, people search). */
export const fieldCompact = 'min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-ink'

// SPEC §2 Calm by design: a chosen option is a soft tint with a check mark (the .choice-on class adds it), never a
// solid fill that looks like the main button. The same style for every choice in the app.
/** The look of a chosen option, for toggles that don't use chip(). */
export const selected = 'choice-on border-accent bg-accent/10 font-semibold text-ink'
const unselected = 'border-line bg-surface text-ink'

/** A round toggle chip (a choice in a row of choices). */
export const chip = (on: boolean) => ['min-h-11 min-w-11 rounded-full border px-3 text-sm', on ? selected : unselected]
/** A narrow chip for weekday pickers, so seven fit in a row. */
export const dayChip = (on: boolean) => ['min-h-11 min-w-11 rounded-full border px-2 text-sm', on ? selected : unselected]
/** A quieter filter chip: the chosen one gets a soft tint and a check mark (add the check in the template). */
export const filterChip = (on: boolean) => ['min-h-11 rounded-full border px-3 text-sm', on ? selected : unselected]
/** One of two or three side-by-side answers (Yes / No, Going / Maybe / No). */
export const choice = (on: boolean) => ['min-h-11 flex-1 rounded-xl border px-3 font-semibold', on ? selected : 'border-line']

/** The main action of a form or window (Save task, Send). */
export const primaryButton = 'min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink'
/** The same, a little smaller, for an action inside a card or list. */
export const primaryButtonSmall = 'min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink'
/** A secondary action (Close, Cancel, Keep it). */
export const secondaryButton = 'min-h-12 rounded-xl border border-line px-4'
/** A smaller secondary action inside a page or card (Settings, Clear crossed-off, Download my data). */
export const smallButton = 'min-h-11 rounded-xl border border-line px-3 text-sm'
/** A small action at the end of a list row (Edit, Cancel), the same in every list (SPEC §2 Calm by design). */
export const rowAction = 'flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium'
/** The "+ New …" button beside a list page's heading: the same on every page (SPEC §2 Adding looks alike). */
export const newButton = 'flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-accent bg-accent/10 px-3 text-sm font-semibold text-ink'
/** The trash can at the end of a list row (SPEC §2 Rows look alike). */
export const rowDelete = 'flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-bg hover:text-ink'
/** The quiet Delete link at the bottom of an editor (it asks first or offers Undo). */
export const deleteLink = 'self-start text-sm text-danger underline'
/** The confirming action of something that affects other people (Cancel event, Drop out): orange, not red (SPEC §2). */
export const warningButton = 'min-h-12 rounded-xl bg-warning px-4 font-semibold text-warning-ink'
/** The same as a quiet outlined button, where it starts that action. */
export const warningOutline = 'min-h-11 self-start rounded-xl border border-warning px-4 text-sm font-semibold text-warning'
/** The confirming action of something that removes data. */
export const dangerButton = 'min-h-12 rounded-xl bg-danger px-4 font-semibold text-danger-ink'

/** A window (dialog) box. */
export const dialogBox = 'm-auto w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40'
/** A small confirmation window box. */
export const confirmBox = 'm-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50'

/** The priority dot colours (SPEC §2 Calm by design: muted, always shown with the label). */
export const priorityDot = { high: 'bg-prio-high', medium: 'bg-prio-medium', low: 'bg-prio-low' } as const

/** A Dashboard card and its big number. */
export const card = 'flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5'
export const bigNumber = 'text-3xl font-bold tabular-nums'
/** A smaller number, for a row of counts like yesterday's. */
export const smallNumber = 'text-xl font-semibold tabular-nums'
