import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { installModalFocus } from './a11y/focus'
import { startAppearance } from './ui/appearance'

// SPEC §3 Appearance: the saved choice applies before anything shows.
startAppearance()

// SPEC §3/§7: service worker so the app opens and captures offline; updates install automatically.
// An installed app can stay open for days without loading a page, so it also checks for a new version every hour
// and whenever it comes back into view; a new version then takes over and the app reloads (writing is saved first).
const UPDATE_CHECK_MS = 60 * 60 * 1000
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => {})
    }
    setInterval(check, UPDATE_CHECK_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

// SPEC §10 Phase 3: ask the browser to keep this device's data for good (Safari can otherwise clear it after weeks
// unopened; anything synced would come back, but changes not yet uploaded wouldn't).
void navigator.storage?.persist?.().catch(() => false)

// SPEC §2: windows keep focus inside while open and give it back when they close.
installModalFocus()

createApp(App).use(createPinia()).use(router).mount('#app')
