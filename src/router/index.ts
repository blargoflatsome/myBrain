import { rememberReturn, takeReturn } from '@/router/returnTo'
import { createRouter, createWebHistory } from 'vue-router'
import { messages } from '@/messages'
import DashboardView from '@/views/DashboardView.vue'
import { useAuthStore } from '@/stores/auth'
import { authRedirect } from './guard'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    /** Public pages anyone can open, signed in or not (guest answer page, privacy, terms). */
    guest?: boolean
  }
}

export const routes = [
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/tasks', name: 'home', component: () => import('@/views/TasksView.vue') },
  { path: '/capture', name: 'capture', component: () => import('@/views/CaptureView.vue') },
  { path: '/routines', name: 'routines', component: () => import('@/views/RoutinesView.vue') },
  { path: '/routines/:id/run', name: 'routine-run', component: () => import('@/views/RoutineRunView.vue') },
  { path: '/journal', name: 'journal', component: () => import('@/views/JournalView.vue') },
  { path: '/vault', name: 'vault', component: () => import('@/views/VaultView.vue') },
  { path: '/calendar', name: 'calendar', component: () => import('@/views/CalendarView.vue') },
  { path: '/habits', name: 'habits', component: () => import('@/views/HabitsView.vue') },
  { path: '/account', name: 'account', component: () => import('@/views/AccountView.vue') },
  { path: '/tags', name: 'tags', component: () => import('@/views/TagsView.vue') },
  { path: '/connections', name: 'connections', component: () => import('@/views/ConnectionsView.vue') },
  { path: '/connect/:token', name: 'connect', component: () => import('@/views/ConnectLinkView.vue'), meta: { returnAfterSignIn: true } },
  // The page was called Profile before; old links still work.
  { path: '/profile', redirect: '/account' },
  { path: '/quests', name: 'quests', component: () => import('@/views/QuestsView.vue') },
  { path: '/orphans', name: 'inbox', component: () => import('@/views/InboxView.vue') },
  // Orphans was called Inbox before; old links still work.
  { path: '/inbox', redirect: '/orphans' },
  { path: '/welcome', name: 'welcome', component: () => import('@/views/WelcomeView.vue') },
  { path: '/rsvp/:invite/:token', name: 'rsvp', component: () => import('@/views/GuestRsvpView.vue'), meta: { public: true, guest: true } },
  { path: '/privacy', name: 'privacy', component: () => import('@/views/PrivacyView.vue'), meta: { public: true, guest: true } },
  { path: '/terms', name: 'terms', component: () => import('@/views/TermsView.vue'), meta: { public: true, guest: true } },
  { path: '/sign-in', name: 'sign-in', component: () => import('@/views/SignInView.vue'), meta: { public: true } },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Each page has its own title (WCAG 2.4.2).
router.afterEach((to) => {
  document.title = messages.pageTitle(messages.pageTitles[String(to.name)])
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  // A connect link opened before signing in comes back after sign-in (SPEC §10 Connections).
  if (!auth.isSignedIn && to.meta.returnAfterSignIn) rememberReturn(to.fullPath)
  if (auth.isSignedIn) {
    const back = takeReturn()
    if (back && back !== to.fullPath) return back
  }
  return authRedirect(to, auth.isSignedIn)
})
