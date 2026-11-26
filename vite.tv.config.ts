// SPEC §9 TV app, How it's built: the TV page's own build, served from the site at /tv/. The TV's engine is about
// Chrome 63, so it targets that, uses plain CSS (no Tailwind) and comes as one script.
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const src = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('./tv', import.meta.url)),
  base: '/tv/',
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  plugins: [
    vue(),
    // Vite's helper for dynamic imports (server.ts loads supabase-js on first use) mentions `import.meta`, which Chrome 63
    // can't even parse. On the TV that import is the stub below and the helper's branch never runs, so it becomes an
    // empty object. The helper is added after renderChunk, so this runs on the finished files.
    // scripts/check-tv-bundle.mjs fails the build if anything newer than the TV can read is left.
    {
      name: 'tv-no-import-meta',
      enforce: 'post',
      generateBundle(_options, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type === 'chunk') file.code = file.code.replace(/\bimport\.meta\b/g, '({})')
        }
      },
    },
  ],
  resolve: {
    alias: [
      // supabase-js isn't loaded on the TV: its calls go through tvServer.ts.
      { find: '@/lib/supabase', replacement: `${src}/tv/screen/noSupabase.ts` },
      { find: '@', replacement: src },
    ],
  },
  build: {
    target: 'chrome63',
    cssTarget: 'chrome63',
    outDir: fileURLToPath(new URL('./dist/tv', import.meta.url)),
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
})
