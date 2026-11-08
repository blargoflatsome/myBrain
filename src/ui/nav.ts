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
  { to: '/account', label: messages.nav.account },
  { to: '/docs', label: messages.nav.help },
]
/** Whether a page belongs under More (its tab or button shows as current). */
export const inMore = (path: string) => MORE_NAV.some((i) => path === i.to || path.startsWith(`${i.to}/`))

/** Simple line icons for the tabs (24×24, drawn with the current text color). */
export const NAV_ICON_PATHS: Record<NavIcon | 'more', string[]> = {
  tasks: ['M9 11l3 3 8-8', 'M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9'],
  habits: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  vault: ['M3 7h18v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z', 'M2 3h20v4H2z', 'M10 11h4'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
}
