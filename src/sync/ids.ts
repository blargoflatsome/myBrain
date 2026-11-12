// Ids made from other ids, for rows that must be the same on every device (SPEC §7: last write wins).
// Two devices making "the same" row then update one row instead of colliding, and undo-then-redo reuses it.

/** A valid uuid: the first 24 characters of an owner's id plus a 12-character tail. */
export function fixedId(ownerId: string, tail: string): string {
  return `${ownerId.slice(0, 24)}${tail}`
}

/**
 * The id of what's logged for an item on a day (a habit's log, a priority task's completion): the item id's first 24
 * characters + the date's 8 digits + a 4-character kind ("0000" for logs).
 */
export function logIdFor(itemId: string, date: string, kind = '0000'): string {
  return fixedId(itemId, `${date.replaceAll('-', '')}${kind}`)
}
