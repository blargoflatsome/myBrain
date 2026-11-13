// SPEC §5 Home page: Google sign-in, which creates the account the first time. Used by the home page's buttons.
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

export function useGoogleSignIn() {
  const auth = useAuthStore()
  const failed = ref(false)
  const busy = ref(false)
  async function signIn() {
    failed.value = false
    busy.value = true
    try {
      await auth.signInWithGoogle()
    } catch {
      failed.value = true
      busy.value = false
    }
  }
  return { failed, busy, signIn }
}
