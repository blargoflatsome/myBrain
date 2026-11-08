// Shared by the dev-only scripts: reads .env.local and refuses to touch production.
import { readFileSync, writeFileSync } from 'node:fs'

export const PROD_REF = 'lcpmvpjjvdkzebbpbymy'
export const TEST_USERS = [
  { key: 'alice', email: 'dev-alice@myadhdbrain.test', name: 'Dev Alice', phone: '555 010 0101' },
  { key: 'bob', email: 'dev-bob@myadhdbrain.test', name: 'Dev Bob', phone: '555 010 0102' },
  { key: 'carol', email: 'dev-carol@myadhdbrain.test', name: 'Dev Carol', phone: '555 010 0103' },
]

export function readEnv(path = '.env.local') {
  const env = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

export function devEnv() {
  const env = readEnv()
  const url = env.VITE_SUPABASE_URL ?? ''
  if (!url || url.includes(PROD_REF)) {
    console.error('✘ .env.local must point at the dev Supabase project. These scripts never run against production.')
    process.exit(1)
  }
  return env
}

/** Set or replace one KEY=value line in .env.local (the value is never printed). */
export function setEnv(key, value, path = '.env.local') {
  const text = readFileSync(path, 'utf8')
  const line = `${key}=${value}`
  const next = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text.replace(/\n?$/, '\n')}${line}\n`
  writeFileSync(path, next)
}
