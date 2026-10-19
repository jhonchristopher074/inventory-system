import { supabase } from './supabase'

/**
 * Remembers that the app was opened from a "Forgot password?" email link.
 *
 * Only then may /reset-password set a new password without asking for the
 * current one. Otherwise anyone at an unattended, logged-in computer could
 * open that page and change the password.
 *
 * Imported first in main.js, so it runs before Supabase reads the link
 * (and removes it from the address bar).
 */

const KEY = 'passwordRecovery'
let recovering = false

// also called after the 6-digit code from the email was accepted
export function startPasswordRecovery() {
  remember()
}

function remember() {
  recovering = true
  try {
    sessionStorage.setItem(KEY, '1') // survives a page refresh in this tab
  } catch {
    // storage disabled: the in-memory flag still works until a refresh
  }
}

// The reset link arrives as ...#access_token=...&type=recovery
if (typeof window !== 'undefined' && /(^|[#&])type=recovery(&|$)/.test(window.location.hash)) {
  remember()
}

// Supabase also announces it once it has read the link.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') remember()
})

export function isPasswordRecovery() {
  if (recovering) return true

  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function endPasswordRecovery() {
  recovering = false

  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
