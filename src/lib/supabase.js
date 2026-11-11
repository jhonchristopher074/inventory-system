import { createClient } from '@supabase/supabase-js'
import { createDemoClient } from './demoClient'
import { guestRole } from './guestMode'

// The test copy (npm run build:staging) reads its own project from
// .env.staging; the live site uses this one.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dvtnrfhsxabtcmpgojnn.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_Q8ji7AnBzqNNDP_qeO7jAA_v1fzL9P8'

// guest mode (lib/guestMode.js): sample data, nothing saved, no network
export const supabase = guestRole() ? createDemoClient(guestRole()) : createClient(supabaseUrl, supabaseKey)

// Is this the account's password? Checked with a separate login that's
// ended right away, so the one in use (and the two-step code it passed)
// stays as it is. Logging in again on the main client replaced it, and the
// Owner was asked for the code again.
export async function passwordIsRight(email, password) {
  if (guestRole()) return false
  const checker = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'password-check',
    },
  })
  const { data, error } = await checker.auth.signInWithPassword({ email, password })
  if (error || !data?.session) return false
  await checker.auth.signOut({ scope: 'local' }).catch(() => {})
  return true
}

// Every realtime subscription needs its own channel name. With a fixed name,
// a screen opened again (e.g. after logging in again) got the previous,
// already-subscribed channel back, and adding to it threw "cannot add
// `postgres_changes` callbacks ... after `subscribe()`" — so live updates
// stopped until the page was refreshed.
export function uniqueChannelName(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
