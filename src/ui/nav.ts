// SPEC §2 Navigation: the four main places (bottom tabs on phones, top of the side menu on wide screens) and
// everything else under More. The Dashboard is reached from "My Brain".
import { messages } from '@/messages'

export type NavIcon = 'tasks' | 'habits' | 'calendar' | 'vault'
export const MAIN_NAV: { to: string; label: string; icon: NavIcon }[] = [
  { to: '/tasks', label: messages.nav.home, icon: 'tasks' },
  { to: '/habits', label: messages.nav.habits, icon: 'habits' },
  { to: '/calendar', label: messages.nav.calendar, icon: 'calendar' },
  { to: '/vault', label: messages.nav.vault, icon: 'vault' },
]
export const MORE_NAV: { to: string; label: string }[] = [
  { to: '/routines', label: messages.nav.routines },
  { to: '/journal', label: messages.nav.journal },
  { to: '/quests', label: messages.nav.quests },
  { to: '/orphans', label: messages.nav.inbox },
  { to: '/connections', label: messages.nav.connections },
]
/** Whether a page belongs under More (its tab or button shows as current). */
export const inMore = (path: string) => MORE_NAV.some((i) => path === i.to || path.startsWith(`${i.to}/`))

