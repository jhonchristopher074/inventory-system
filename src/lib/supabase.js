import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dvtnrfhsxabtcmpgojnn.supabase.co'
const supabaseKey = 'sb_publishable_Q8ji7AnBzqNNDP_qeO7jAA_v1fzL9P8'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Every realtime subscription needs its own channel name. With a fixed name,
// a screen opened again (e.g. after logging in again) got the previous,
// already-subscribed channel back, and adding to it threw "cannot add
// `postgres_changes` callbacks ... after `subscribe()`" — so live updates
// stopped until the page was refreshed.
export function uniqueChannelName(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}