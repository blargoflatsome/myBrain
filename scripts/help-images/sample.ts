// Sample data for the Help and home page pictures (SPEC §5 Home page and Help): a believable week in someone's
// My Brain, put on the browser tests' stand-in server. Tuesday 10 November 2026, 8:30 am in New York.
import type { FakeSupabase } from '../../src/tests/e2e/support/fakeSupabase'

export const NOW = new Date('2026-11-10T13:30:00Z')
export const DAY = '2026-11-10'
export const ROUTINE = 'aaaaaaaa-0000-4000-8000-000000000001'
export const FRIEND = '22222222-2222-4222-8222-222222222222'

const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-11-${String(from + i).padStart(2, '0')}`)
const logs = (habit: string, dates: string[]) =>
  dates.map((date) => ({ id: `${habit}-${date}`, habit_id: habit, date, status: 'completed', completed_at: `${date}T14:00:00Z` }))

export function seedSample(server: FakeSupabase) {
  // Celebrations off, so no pop-up covers the picture.
  server.setProfile({ display_name: 'Sam Rivera', timezone: 'America/New_York', celebrations: 'off' })
  server.seed('tasks', [
    { id: 't1', title: 'Pay rent', notes: 'Before 5 pm', due_date: DAY, priority: 3, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:01Z' },
    { id: 't2', title: 'Email Jo about Saturday', notes: null, due_date: DAY, priority: 2, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:02Z' },
    { id: 't3', title: 'Pick up the prescription', notes: null, due_date: DAY, priority: 2, status: 'done', completed_at: '2026-11-10T13:20:00Z', source: 'manual', created_at: '2026-11-01T00:00:03Z' },
    { id: 't4', title: 'Return the library books', notes: null, due_date: '2026-11-08', priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:04Z' },
    { id: 't5', title: 'Book a haircut', notes: null, due_date: null, priority: 1, status: 'open', source: 'manual', created_at: '2026-11-01T00:00:05Z' },
  ])
  server.seed('habits', [
    { id: 'h1', title: 'Take meds', notify_time: '09:00', timer_minutes: 120, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-10-01', current_streak: 9, best_streak: 21 },
    { id: 'h2', title: 'Drink water', notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-10-01', current_streak: 4, best_streak: 12 },
    { id: 'h3', title: 'Walk 20 minutes', notify_time: '18:00', timer_minutes: null, weekdays: [1, 3, 5], start_date: '2026-10-01', current_streak: 3, best_streak: 6 },
  ])
  server.seed('habit_logs', [...logs('h1', days(1, 9)), ...logs('h2', days(6, 9)), ...logs('h3', ['2026-11-04', '2026-11-06'])])
  server.seed('routines', [{ id: ROUTINE, title: 'Morning', notify_time: '07:30', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-10-01' }])
  server.seed('routine_steps', [
    { id: '00000001-0000-4000-8000-000000000001', routine_id: ROUTINE, position: 0, title: 'Brush teeth', start_date: '2026-10-01' },
    { id: '00000002-0000-4000-8000-000000000002', routine_id: ROUTINE, position: 1, title: 'Shower', start_date: '2026-10-01' },
    { id: '00000003-0000-4000-8000-000000000003', routine_id: ROUTINE, position: 2, title: 'Pack lunch', start_date: '2026-10-01' },
    { id: '00000004-0000-4000-8000-000000000004', routine_id: ROUTINE, position: 3, title: 'Keys, wallet, phone', start_date: '2026-10-01' },
  ])
  server.seed('priority_tasks', [
    { id: 'pt1', title: 'Insulin', description: 'With dinner', reminder_time: '18:30', due_date: DAY, weekdays: null, start_date: DAY },
  ])
  server.seed('quests', [
    { id: 'q1', title: 'Repot the basil', details: 'The pot is under the sink', energy_level: 'ugh', time_bucket: '30m', status: 'open' },
    { id: 'q2', title: 'Learn three chords', details: null, energy_level: 'fun', time_bucket: '2h', status: 'open' },
    { id: 'q3', title: 'Sort the photo album', details: null, energy_level: 'needs_setup', time_bucket: 'half_day', status: 'open' },
  ])
  server.seed('inbox', [
    { id: 'i1', body: 'Call the dentist about the cleaning', created_at: '2026-11-09T22:00:00Z' },
    { id: 'i2', body: 'Gift idea for Mom: the blue scarf from the market', created_at: '2026-11-10T12:40:00Z' },
  ])
  server.seed('journal_entries', [
    { id: 'j9', date: '2026-11-09', body: '<p>Got the big thing done at work. Felt <strong>good</strong>.</p>', tomorrow: '<p>Start with the rent.</p>', better_than_yesterday: true, stats: {}, auto: false, stats_final: true },
    { id: 'j8', date: '2026-11-08', body: '<p>Slow day. Rested.</p>', tomorrow: null, better_than_yesterday: false, stats: {}, auto: false, stats_final: true },
  ])
  server.seed('post_its', [
    { id: 'p1', body: '<p><strong>Call the vet</strong></p><ul><li><p>Shots for Biscuit</p></li></ul>', color: 'yellow', position: 0 },
    { id: 'p2', body: '<p>Wifi password is on the router</p>', color: 'blue', position: 1 },
  ])
  server.seed('vault_buckets', [{ id: 'b1', name: 'Books to read', position: 5, checkable: true, starred: true }])
  server.seed('vault_items', [
    { id: 'v1', bucket_id: 'b1', title: 'Dune', notes: 'Jo recommended it', rating: 4, link: null, checked: false },
    { id: 'v2', bucket_id: 'b1', title: 'The Hobbit', notes: null, rating: 5, link: null, checked: true },
    { id: 'v3', bucket_id: 'b1', title: 'Atomic Habits', notes: null, rating: null, link: null, checked: false },
    { id: 'v4', bucket_id: 'bucket-0', title: 'Oat milk', notes: null, rating: null, link: null, checked: false },
    { id: 'v5', bucket_id: 'bucket-0', title: 'Bananas', notes: null, rating: null, link: null, checked: false },
  ])
  server.seed('events', [
    { id: 'e1', title: 'Dentist', notes: null, start_date: DAY, start_time: '15:00:00', end_date: DAY, end_time: '16:00:00', repeat: 'never', reminder_minutes: 30 },
    { id: 'e2', title: 'Game night', notes: 'Bring snacks', start_date: '2026-11-14', start_time: '19:00:00', end_date: '2026-11-14', end_time: '22:00:00', repeat: 'never', reminder_minutes: 60 },
    { id: 'e3', title: 'Team lunch', notes: null, start_date: '2026-11-12', start_time: '12:00:00', end_date: '2026-11-12', end_time: '13:00:00', repeat: 'never', reminder_minutes: null },
  ])
  server.seed('event_invites', [
    { id: 'inv1', event_id: 'e2', host_name: 'Sam Rivera', name: 'Jo', email: null, phone: '5550109000', response: 'yes' },
    { id: 'inv2', event_id: 'e2', host_name: 'Sam Rivera', name: 'Alex', email: null, phone: '5550109001', response: 'pending' },
  ])
  server.seed('tags', [
    { id: 'tag1', name: 'Work' },
    { id: 'tag2', name: 'Home' },
  ])
  server.seed('item_tags', [
    { id: 'it1', item_type: 'task', item_id: 't2', tag_id: 'tag1' },
    { id: 'it2', item_type: 'task', item_id: 't1', tag_id: 'tag2' },
  ])
  server.seed('notifications', [
    { id: 'n1', kind: 'connection_request', item_id: null, title: 'Jo wants to connect', body: 'Open Connections to answer.', url: '/connections', local_date: DAY, sent_at: '2026-11-10T13:10:00Z' },
    { id: 'n2', kind: 'habit', item_id: null, title: 'Take meds', body: 'Reminder: Past you asked that you take your meds.', url: '/habits', local_date: DAY, sent_at: '2026-11-10T13:00:00Z' },
  ])
}
