// Connections (SPEC §10 Connections): people agree they know each other before they can invite each other in the
// app. Everything goes through server functions; asking never reveals whether an email or phone has an account.
import { supabase } from '@/lib/supabase'

export interface Connection {
  friend_id: string
  display_name: string
  avatar_url: string | null
  since: string
}
export interface IncomingRequest {
  id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}
export interface SentRequest {
  id: string
  contact: string
  created_at: string
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}
const list = async <T>(fn: string) => (await call<T[] | null>(fn)) ?? []

export const requestConnection = (contact: string) => call<void>('request_connection', { contact })
export const incomingRequests = () => list<IncomingRequest>('incoming_connection_requests')
export const sentRequests = () => list<SentRequest>('sent_connection_requests')
export const answerRequest = (req: string, answer: 'accept' | 'decline' | 'block') => call<void>('answer_connection_request', { req, answer })
export const cancelRequest = (req: string) => call<void>('cancel_connection_request', { req })
export const myConnections = () => list<Connection>('my_connections')
export const removeConnection = (friend: string, alsoBlock = false) => call<void>('remove_connection', { friend, also_block: alsoBlock })
