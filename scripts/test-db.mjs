// Runs the SQL rule checks in supabase/tests against the linked dev project and reports a clear result.
// Each check file is one DO block that raises "FAIL: <rule>" on the first broken rule, or "PASS: ..." at the
// very end. Raising is how it forces Postgres to roll back the fake test users, so the Supabase CLI always
// reports it as an error; this script reads that message and turns it into a normal pass/fail.
// Running `npm run test:db` yourself is your confirmation to run these statements on dev (hence --yes).
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const dir = 'supabase/tests'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
let failed = 0

for (const file of files) {
  let output
  try {
    output = execFileSync('npx', ['supabase', 'db', 'query', '--remote', '--yes', '-f', `${dir}/${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
  } catch (err) {
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`
  }

  const pass = output.match(/PASS: ([^\\"\n]+)/)
  const fail = output.match(/FAIL: ([^\\"\n]+)/)
  if (pass && !fail) {
    console.log(`✔ ${file}: ${pass[1]}`)
  } else if (fail) {
    failed++
    console.log(`✘ ${file}: ${fail[1]}`)
  } else {
    failed++
    console.log(`✘ ${file}: did not finish. Supabase CLI output:\n${output}`)
  }
}

console.log(failed ? `\n${failed} of ${files.length} check files failed.` : `\nAll ${files.length} check files passed.`)
process.exit(failed ? 1 : 0)
