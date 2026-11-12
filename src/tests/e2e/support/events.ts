import type { Locator } from '@playwright/test'

// SPEC §5 Calendar: the event editor folds its sections away. These open one if it isn't open already
// (a fold-out can start open, so clicking blindly could close it).
async function openFold(fold: Locator) {
  await fold.waitFor()
  if (!(await fold.evaluate((d) => (d as HTMLDetailsElement).open))) await fold.locator('summary').click()
}
/** Open the event editor's Attendees section. */
export const openAttendees = (dialog: Locator) => openFold(dialog.getByTestId('event-people'))
/** Open the event editor's Schedule section. */
export const openSchedule = (dialog: Locator) => openFold(dialog.getByTestId('event-schedule'))
