/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { previewHeaders } from './build/security-headers'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // SPEC §3: installable PWA with a service worker, home-screen capture shortcut, and Web Share Target.
    VitePWA({
      registerType: 'autoUpdate',
      // Our own service worker (src/sw.ts) so it can show Web Push notifications (SPEC §6).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        id: '/',
        name: 'My Brain',
        short_name: 'My Brain',
        description: 'Capture everything you need to remember.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Capture',
            short_name: 'Capture',
            description: 'Save a thought',
            url: '/capture',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        share_target: {
          action: '/capture',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
    }),
  ],
  // The browser tests run against `vite preview` with the same security headers as Netlify (public/_headers).
  preview: { headers: previewHeaders(fileURLToPath(new URL('./public/_headers', import.meta.url))) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
