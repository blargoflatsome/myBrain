import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'
import { registerSW } from 'virtual:pwa-register'

// SPEC §3/§7: service worker so the app opens and captures offline; updates install automatically.
registerSW({ immediate: true })

createApp(App).use(createPinia()).use(router).mount('#app')
