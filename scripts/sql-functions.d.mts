// Types for sql-functions.mjs, for the browser tests' stand-in server (src/tests/e2e/support/fakeSupabase.ts).
export function latestFunctions(): Map<string, { file: string; sql: string }>
export function functionParams(sql: string): { name: string; optional: boolean }[]
