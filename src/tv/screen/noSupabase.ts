// SPEC §9 TV app, Access: the TV build points `@/lib/supabase` here (vite.tv.config.ts), so supabase-js is never
// bundled for the TV. The TV's calls all go through its own adapter (tvServer.ts); reaching this is a bug.
export const supabase = new Proxy({}, {
  get() {
    throw new Error('The TV page calls the server through tvServer.ts only.')
  },
})
