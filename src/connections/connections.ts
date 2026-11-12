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
const list = async <T>(fn: string, args: Record<string, unknown> = {}) => (await call<T[] | null>(fn, args)) ?? []

export const requestConnection = (contact: string) => call<void>('request_connection', { contact })
export const incomingRequests = () => list<IncomingRequest>('incoming_connection_requests')
export const sentRequests = () => list<SentRequest>('sent_connection_requests')
export const answerRequest = (req: string, answer: 'accept' | 'decline' | 'block') => call<void>('answer_connection_request', { req, answer })
export const cancelRequest = (req: string) => call<void>('cancel_connection_request', { req })
export const myConnections = () => list<Connection>('my_connections')
export const removeConnection = (friend: string, alsoBlock = false) => call<void>('remove_connection', { friend, also_block: alsoBlock })

// ---------- Part 2: connect links and codes ----------
export interface NewLink {
  id: string
  token: string
  code: string
  expires_at: string
}
export interface ActiveLink {
  id: string
  created_at: string
  expires_at: string
}
export interface LinkOwner {
  display_name: string
  avatar_url: string | null
  already_connected: boolean
}
type LinkKey = { token?: string; code?: string }
export const createLink = async () => (await list<NewLink>('create_connect_link'))[0]!
export const myLinks = () => list<ActiveLink>('my_connect_links')
export const cancelLink = (link: string) => call<void>('cancel_connect_link', { link })
export const previewLink = async (k: LinkKey) => (await call<LinkOwner[] | null>('preview_connect_link', { token: k.token ?? null, code: k.code ?? null })) ?? []
/** Connects us; returns their name, or null if the link or code no longer works. */
export const useLink = (k: LinkKey) => call<string | null>('use_connect_link', { token: k.token ?? null, code: k.code ?? null })
export const linkUrl = (token: string, origin: string = window.location.origin) => `${origin}/connect/${token}`

// ---------- Part 3: connect from my people and from a guest invitation ----------
/** Ids of my saved people whose email belongs to an account I'm not connected with (they show Connect). */
export const peopleWithAccounts = async () => new Set((await list<{ person_id: string }>('people_with_accounts')).map((r) => r.person_id))
/** Ids of my saved people who are already connections (matched by their email or phone), shown once, as the connection. */
export const peopleWhoAreConnections = async () => new Set((await list<{ person_id: string }>('people_who_are_connections')).map((r) => r.person_id))
export const guestConnectOffer = (invite: string, token: string) => call<boolean | null>('guest_connect_offer', { invite, token })
export const guestConnectWithHost = (invite: string, token: string) => call<void>('guest_connect_with_host', { invite, token })

// ---------- Part 3: who's going ----------
export interface Attendee {
  /** Null for a guest without an account (shown by first name only). */
  user_id: string | null
  display_name: string
  avatar_url: string | null
  is_host: boolean
  connected: boolean
  can_connect: boolean
}
export const eventAttendees = (event: string) => list<Attendee>('event_attendees', { event })
export const connectViaEvent = (event: string, friend: string) => call<void>('connect_via_event', { event, friend })
export const setEventVisibility = (invite: string, show: boolean) => call<void>('set_event_visibility', { invite, show })

// ---------- Part 4: guest links ----------
export type ClaimStatus = 'none' | 'match' | 'ask' | 'claimed'
export const guestClaimStatus = async (invite: string, token: string) => ((await call<string | null>('guest_claim_status', { invite, token })) ?? 'none') as ClaimStatus
export const claimGuestInvite = (invite: string, token: string) => call<boolean>('claim_guest_invite', { invite, token })
export const newInviteLink = (invite: string) => call<string>('new_invite_link', { invite })
export interface ChangeRecipient {
  invite_id: string
  name: string | null
  email: string | null
  phone: string | null
  body: string
}
export const eventChanged = (event: string) => list<ChangeRecipient>('event_changed', { event })
