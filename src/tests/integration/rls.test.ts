// Runs against the linked Supabase dev project. Skipped when no keys are configured (for example in CI).
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const configured = Boolean(url && key && url.includes('.supabase.co'))

describe.skipIf(!configured)('Spec §2, §8: row-level security on every table (dev database)', () => {
  const anon = configured ? createClient(url, key, { auth: { persistSession: false } }) : null!

  it('a signed-out visitor cannot read any profiles', async () => {
    const { data, error } = await anon.from('profiles').select('id')
    // Either access is refused outright, or the table exists and returns nothing. A missing table fails.
    if (error) expect(error.code).toBe('42501')
    else expect(data).toEqual([])
  })

  it('a signed-out visitor cannot create a profile', async () => {
    const { error } = await anon
      .from('profiles')
      .insert({ user_id: '00000000-0000-0000-0000-000000000000', display_name: 'intruder' })
    expect(error).not.toBeNull()
  })
})
