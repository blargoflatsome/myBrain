// "Download my data" (SPEC §8): everything I own, from the server, as one JSON file.
import { supabase } from '@/lib/supabase'
import { SYNC_TABLES } from '@/sync/types'

const EXTRA_TABLES = ['outbound_messages'] as const
const PAGE = 1000

async function allRows(table: string, columns = '*'): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

export async function exportMyData(userId: string, now: Date = new Date()) {
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  const tables: Record<string, unknown[]> = {}
  for (const table of SYNC_TABLES) tables[table] = await allRows(table)
  tables.outbound_messages = await allRows(
    EXTRA_TABLES[0],
    'id, event_id, invite_id, recipient_name, recipient_email, recipient_phone, channel, kind, subject, body, status, sent_at, created_at',
  )
  return { app: 'My Brain', exported_at: now.toISOString(), profile, tables }
}

export async function downloadMyData(userId: string) {
  const data = await exportMyData(userId)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `my-brain-data-${data.exported_at.slice(0, 10)}.json`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
