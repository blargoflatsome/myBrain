// SPEC §5 Trophies: connections ever made, people blocked and my Cheers tally live only on the server.
import { serverCall } from '@/server/server'
import type { CheerTally } from '@/trophies/rules'

export interface ServerCounts {
  connections: number | null
  blocks: number | null
  cheers: CheerTally | null
}

interface Row {
  connections?: number
  blocks?: number
  cheers_given?: number
  cheer_days?: number
  cheer_firsts?: number
  cheer_unstuck?: number
  cheer_while_stuck?: boolean
}

/** The counts, or nulls when the server can't be asked (offline): those trophies just wait. */
export async function trophyCounts(): Promise<ServerCounts> {
  const none = { connections: null, blocks: null, cheers: null }
  try {
    const data = await serverCall<Row[] | Row | null>('trophy_counts')
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return none
    return {
      connections: row.connections ?? 0,
      blocks: row.blocks ?? 0,
      cheers: {
        given: row.cheers_given ?? 0,
        days: row.cheer_days ?? 0,
        firsts: row.cheer_firsts ?? 0,
        unstuck: row.cheer_unstuck ?? 0,
        whileStuck: !!row.cheer_while_stuck,
      },
    }
  } catch {
    return none
  }
}
