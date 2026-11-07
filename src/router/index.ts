import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import { useAuthStore } from '@/stores/auth'
import { authRedirect } from './guard'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
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
  // The page was called Profile before; old links still work.
  { path: '/profile', redirect: '/account' },
  { path: '/quests', name: 'quests', component: () => import('@/views/QuestsView.vue') },
  { path: '/inbox', name: 'inbox', component: () => import('@/views/InboxView.vue') },
  { path: '/sign-in', name: 'sign-in', component: () => import('@/views/SignInView.vue'), meta: { public: true } },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  return authRedirect(to, auth.isSignedIn)
})
