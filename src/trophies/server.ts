// SPEC §5 Trophies: connections ever made and people blocked live only on the server.
import { supabase } from '@/lib/supabase'

/** The counts, or nulls when the server can't be asked (offline): those trophies just wait. */
export async function trophyCounts(): Promise<{ connections: number | null; blocks: number | null }> {
  try {
    const { data, error } = await supabase.rpc('trophy_counts')
    const row = (Array.isArray(data) ? data[0] : data) as { connections?: number; blocks?: number } | null
    if (error || !row) return { connections: null, blocks: null }
    return { connections: row.connections ?? 0, blocks: row.blocks ?? 0 }
  } catch {
    return { connections: null, blocks: null }
  }
}
