// SPEC §9 TV app: the TV page's start. It talks to the server only through the tv_* functions (tvServer.ts).
import '@/tv/screen/polyfills'
import { createApp } from 'vue'
import TvApp from '@/tv/screen/TvApp.vue'
import { useServerAdapter } from '@/server/server'
import { tvServerAdapter } from '@/tv/screen/tvServer'
import '@/tv/screen/tv.css'

useServerAdapter(tvServerAdapter(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY))
createApp(TvApp).mount('#tv')
