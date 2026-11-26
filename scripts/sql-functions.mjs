// The server functions as they stand now: each one's latest `create function` in supabase/migrations (later files
// replace earlier ones; a `drop function` with no later create removes it). Used by db-fn.mjs and
// check-limit-codes.mjs.
import { readdirSync, readFileSync } from 'node:fs'

const dir = 'supabase/migrations'
const CREATE = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi
const DROP = /drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*(?:\(|;)/gi

/** Map of function name → { file, sql } for its latest definition, up to the end of its dollar-quoted body. */
export function latestFunctions() {
  const latest = new Map()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const text = readFileSync(`${dir}/${file}`, 'utf8')
    const events = []
    for (const m of text.matchAll(DROP)) events.push({ at: m.index, drop: m[1] })
    for (const m of text.matchAll(CREATE)) {
      const open = /\$(\w*)\$/.exec(text.slice(m.index))
      if (!open) continue
      const bodyStart = m.index + open.index + open[0].length
      const close = text.indexOf(open[0], bodyStart)
      if (close < 0) continue
      events.push({ at: m.index, name: m[1], sql: `${text.slice(m.index, close + open[0].length)};` })
    }
    for (const e of events.sort((a, b) => a.at - b.at)) {
      if (e.drop) latest.delete(e.drop)
      else latest.set(e.name, { file, sql: e.sql })
    }
  }
  return latest
}

/** The input parameters a function's definition names, in order, each with whether it has a default (so callers may
 *  leave it out). The browser tests' stand-in server checks every call against these, as the real server does. */
export function functionParams(sql) {
  const open = sql.indexOf('(')
  let depth = 0
  let end = open
  for (; end < sql.length; end++) {
    if (sql[end] === '(') depth++
    else if (sql[end] === ')' && --depth === 0) break
  }
  const parts = []
  let current = ''
  depth = 0
  for (const ch of sql.slice(open + 1, end)) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += ch
  }
  parts.push(current)
  return parts
    .map((p) => p.trim().split(/\s+/))
    .filter((words) => words[0] && !/^out$/i.test(words[0]))
    .map((words) => {
      const named = /^(in|inout)$/i.test(words[0]) ? words.slice(1) : words
      return { name: named[0], optional: named.some((w) => /^default$/i.test(w) || w === '=') }
    })
}
