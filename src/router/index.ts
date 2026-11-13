import { rememberReturn, takeReturn } from '@/router/returnTo'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { messages } from '@/messages'
import HomeView from '@/home/HomeView.vue'
import { useAuthStore } from '@/stores/auth'
import { authRedirect } from './guard'
import { setCanonical } from '@/seo/canonical'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    /** Public pages anyone can open, signed in or not (guest answer page, privacy, terms). */
    guest?: boolean
    /** SPEC §5 Home page: the home page for everyone; the marketing page when signed out, the Dashboard when signed in. */
    landing?: boolean
  }
}

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: HomeView, meta: { landing: true } },
  { path: '/tasks', name: 'home', component: () => import('@/tasks/TasksView.vue') },
  { path: '/capture', name: 'capture', component: () => import('@/capture/CaptureView.vue') },
  { path: '/routines', name: 'routines', component: () => import('@/routines/RoutinesView.vue') },
  { path: '/routines/:id/run', name: 'routine-run', component: () => import('@/routines/RoutineRunView.vue') },
  { path: '/journal', name: 'journal', component: () => import('@/journal/JournalView.vue') },
  { path: '/vault', name: 'vault', component: () => import('@/vault/VaultView.vue') },
  { path: '/calendar', name: 'calendar', component: () => import('@/events/CalendarView.vue') },
  { path: '/habits', name: 'habits', component: () => import('@/habits/HabitsView.vue') },
  { path: '/account', name: 'account', component: () => import('@/account/AccountView.vue') },
  { path: '/tags', name: 'tags', component: () => import('@/tags/TagsView.vue') },
  { path: '/help', name: 'help', component: () => import('@/help/HelpView.vue') },
  { path: '/connections', name: 'connections', component: () => import('@/connections/ConnectionsView.vue') },
  { path: '/people/:id', name: 'person', component: () => import('@/profiles/ProfileView.vue') },
  { path: '/connect/:token', name: 'connect', component: () => import('@/connections/ConnectLinkView.vue'), meta: { returnAfterSignIn: true } },
  // The page was called Profile before; old links still work.
  { path: '/profile', redirect: '/account' },
  { path: '/quests', name: 'quests', component: () => import('@/quests/QuestsView.vue') },
  { path: '/orphans', name: 'inbox', component: () => import('@/capture/InboxView.vue') },
  // Orphans was called Inbox before; old links still work.
  { path: '/inbox', redirect: '/orphans' },
  { path: '/welcome', name: 'welcome', component: () => import('@/auth/WelcomeView.vue') },
  { path: '/rsvp/:invite/:token', name: 'rsvp', component: () => import('@/events/GuestRsvpView.vue'), meta: { public: true, guest: true } },
  { path: '/privacy', name: 'privacy', component: () => import('@/legal/PrivacyView.vue'), meta: { public: true, guest: true } },
  { path: '/terms', name: 'terms', component: () => import('@/legal/TermsView.vue'), meta: { public: true, guest: true } },
  // SPEC §5 Home page: signing in happens on the home page now; old links (and ?deleted=1) go there.
  { path: '/sign-in', name: 'sign-in', redirect: (to) => ({ name: 'dashboard', query: to.query }) },
  // SPEC §8: any other address (Netlify answers it with 404). Keep it last.
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/seo/NotFoundView.vue'), meta: { public: true, guest: true } },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Each page has its own title (WCAG 2.4.2).
router.afterEach((to) => {
  const signedOutHome = to.meta.landing && !useAuthStore().isSignedIn
  document.title = messages.pageTitle(signedOutHome ? undefined : messages.pageTitles[String(to.name)])
  setCanonical(to.path)
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
