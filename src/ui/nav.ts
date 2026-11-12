// SPEC §2 Navigation: the four main places (bottom tabs on phones, top of the side menu on wide screens) and
// everything else under More. The Dashboard is reached from "My Brain".
import { messages } from '@/messages'
import type { IconName } from '@/ui/icons'

export type NavIcon = 'tasks' | 'habits' | 'calendar' | 'vault'
export const MAIN_NAV: { to: string; label: string; icon: NavIcon }[] = [
  { to: '/tasks', label: messages.nav.home, icon: 'tasks' },
  { to: '/habits', label: messages.nav.habits, icon: 'habits' },
  { to: '/calendar', label: messages.nav.calendar, icon: 'calendar' },
  { to: '/vault', label: messages.nav.vault, icon: 'vault' },
]
// SPEC §3 Navigation: every menu item has its icon, the same in the tab bar, side menu and More panel.
export const MORE_NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/routines', label: messages.nav.routines, icon: 'repeat' },
  { to: '/journal', label: messages.nav.journal, icon: 'book' },
  { to: '/quests', label: messages.nav.quests, icon: 'shuffle' },
  { to: '/orphans', label: messages.nav.inbox, icon: 'inbox' },
  { to: '/connections', label: messages.nav.connections, icon: 'users' },
]
/** Whether a page belongs under More (its tab or button shows as current). */
export const inMore = (path: string) => MORE_NAV.some((i) => path === i.to || path.startsWith(`${i.to}/`))

