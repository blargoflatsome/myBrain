// Rows are soft-deleted (SPEC §7): a deleted row keeps a deleted_at time so the deletion syncs to other devices.

/** The rows that haven't been deleted. */
export const live = <T extends { deleted_at?: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deleted_at)
