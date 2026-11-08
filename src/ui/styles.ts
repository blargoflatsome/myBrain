// Shared Tailwind class lists, so every screen's controls look and behave the same (docs/CODING_STANDARDS.md).
// Field borders get their contrast colour from style.css (WCAG 1.4.11), whatever border class is used here.

/** A text box, list or date field inside a card or window. */
export const field = 'min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-base text-ink'
/** The same, straight on the page background. */
export const fieldOnPage = 'min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink'
/** A slightly smaller field for dense forms (availability, people search). */
export const fieldCompact = 'min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-ink'

const selected = 'border-accent bg-accent font-semibold text-accent-ink'
const unselected = 'border-line bg-surface text-ink'

/** A round toggle chip (a choice in a row of choices). */
export const chip = (on: boolean) => ['min-h-11 min-w-11 rounded-full border px-3 text-sm', on ? selected : unselected]
/** A narrow chip for weekday pickers, so seven fit in a row. */
export const dayChip = (on: boolean) => ['min-h-11 min-w-11 rounded-full border px-2 text-sm', on ? selected : unselected]
/** A quieter filter chip: the chosen one gets a soft tint and a check mark (add the check in the template). */
export const filterChip = (on: boolean) => [
  'min-h-11 rounded-full border px-3 text-sm',
  on ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line bg-surface text-ink',
]
/** One of two or three side-by-side answers (Yes / No, Going / Maybe / No). */
export const choice = (on: boolean) => ['min-h-11 flex-1 rounded-xl border px-3 font-semibold', on ? selected : 'border-line']

/** A secondary action (Close, Cancel, Keep it). */
export const secondaryButton = 'min-h-12 rounded-xl border border-line px-4'
/** The confirming action of something that removes data. */
export const dangerButton = 'min-h-12 rounded-xl bg-danger px-4 font-semibold text-danger-ink'

/** A window (dialog) box. */
export const dialogBox = 'm-auto w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40'
/** A small confirmation window box. */
export const confirmBox = 'm-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50'

/** A Dashboard card and its big number. */
export const card = 'flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4'
export const bigNumber = 'text-3xl font-bold tabular-nums'
