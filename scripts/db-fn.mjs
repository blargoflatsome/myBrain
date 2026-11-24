// `npm run db:fn <name>`: print a server function's latest definition from the migrations, the version a new
// migration that changes it starts from. With no name, lists every function and the file that defines it now.
import { latestFunctions } from './sql-functions.mjs'

const name = process.argv[2]
const fns = latestFunctions()
if (!name) {
  for (const [n, { file }] of [...fns].sort(([a], [b]) => a.localeCompare(b))) console.log(`${n}  ${file}`)
} else {
  const fn = fns.get(name)
  if (!fn) {
    console.error(`No server function named ${name}. Run npm run db:fn to list them.`)
    process.exit(1)
  }
  console.log(`-- ${name}: from ${fn.file}`)
  console.log(fn.sql)
}
