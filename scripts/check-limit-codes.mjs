// SPEC §7 Things only the server can do: every limit the server keeps raises the limit code (P0429), so the app can
// say which limit was reached. Fails when a server function's latest definition raises a limit ("At most …",
// "Too many …", "… limit reached") with any other code. Run by `npm run lint`, so CI runs it too.
import { latestFunctions } from './sql-functions.mjs'

const LIMIT = /raise\s+exception\s+'((?:At most|Too many)[^']*|[^']*limit reached[^']*)'([^;]*);/gi
const problems = []
for (const [name, { file, sql }] of latestFunctions()) {
  for (const m of sql.matchAll(LIMIT)) {
    if (!/errcode\s*=\s*'P0429'/i.test(m[2])) problems.push(`${name} (${file}): '${m[1]}' must use errcode = 'P0429'`)
  }
}
if (problems.length) {
  console.error(`Limits must raise the limit code (SPEC §7):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('Limit codes: every server limit raises P0429.')
