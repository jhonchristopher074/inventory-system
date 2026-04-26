import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dvtnrfhsxabtcmpgojnn.supabase.co'
const supabaseKey = 'sb_publishable_Q8ji7AnBzqNNDP_qeO7jAA_v1fzL9P8'

export const supabase = createClient(supabaseUrl, supabaseKey)  