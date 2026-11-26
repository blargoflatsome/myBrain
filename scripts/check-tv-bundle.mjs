// SPEC §9 TV app, How it's built: the TV's engine is about Chrome 63, which reads ES2017 plus object spread and async
// iteration. One newer word in the TV's script (optional chaining, `import.meta`, a class field) stops the whole page
// from loading there, and no browser test can catch it (they run today's Chromium). Run after `vite build --config
// vite.tv.config.ts` by `npm run build` and the browser tests.
import { readdirSync, readFileSync } from 'node:fs'
import { parse } from 'acorn'

const dir = 'dist/tv/assets'
const NEWER_REGEX = /\(\?<(?![=!])|\\[pP]\{/
const scripts = readdirSync(dir).filter((f) => f.endsWith('.js'))
if (!scripts.length) {
  console.error('TV bundle: no script in dist/tv/assets. Build it first: vite build --config vite.tv.config.ts')
  process.exit(1)
}
let failed = false
for (const f of scripts) {
  const code = readFileSync(`${dir}/${f}`, 'utf8')
  try {
    parse(code, {
      ecmaVersion: 2018,
      sourceType: 'module',
      // ES2018 regular expressions Chrome 63 can't read (named groups and Unicode property escapes came in Chrome 64).
      onToken: (t) => {
        if (t.type.label !== 'regexp') return
        if (NEWER_REGEX.test(t.value.pattern)) throw Object.assign(new SyntaxError(`newer regular expression /${t.value.pattern}/`), { pos: t.start })
      },
    })
  } catch (err) {
    failed = true
    const at = err.pos ?? 0
    console.error(`TV bundle: ${f} has syntax the TV can't read (${err.message}): …${code.slice(Math.max(0, at - 80), at + 40)}…`)
  }
}
if (failed) process.exit(1)
console.log('TV bundle: readable by Chrome 63.')
