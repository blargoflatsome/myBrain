/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { previewHeaders } from './build/security-headers'
import { seo } from './build/seo'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    seo(),
    // `vite preview` only (the browser tests; Netlify serves the real site). Keep idle connections open: WebKit (the
    // iPhone tests) reuses one connection across tests, and Node closing it after 5 idle seconds could reset a test's
    // first page load ("Failure when receiving data from the peer"). Chromium opens a new connection per test.
    {
      name: 'preview-keep-alive',
      configurePreviewServer(server) {
        if ('keepAliveTimeout' in server.httpServer) server.httpServer.keepAliveTimeout = 0
      },
    },
    // SPEC §3: installable PWA with a service worker, home-screen capture shortcut, and Web Share Target.
    VitePWA({
      registerType: 'autoUpdate',
      // Our own service worker (src/sw.ts) so it can show Web Push notifications (SPEC §6).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // The share picture is for link previews only, so devices don't need to download it.
        globIgnores: ['og-image.png'],
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
        // SPEC §8 Browser colours: the calm palette's background (style.css --bg).
        background_color: '#f6f4ef',
        theme_color: '#f6f4ef',
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
    include: ['src/tests/unit/**/*.test.ts', 'src/tests/integration/**/*.test.ts'],
  },
})
