import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'
import { authRedirect } from './guard'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
  }
}

export const routes = [
  { path: '/', name: 'home', component: HomeView },
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
