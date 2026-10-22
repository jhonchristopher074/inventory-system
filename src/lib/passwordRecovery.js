import { supabase } from './supabase'

/**
 * Remembers that the person proved, through the "Forgot password?" email,
 * that the account is theirs (the link in it, or the 6-digit code).
 *
 * Only then may /reset-password set a new password without asking for the
 * current one. Otherwise anyone at an unattended, logged-in computer could
 * open that page and change the password.
 *
 * The permission comes only from Supabase's PASSWORD_RECOVERY event, which
 * it sends after the server has checked the link or code. (Before, any
 * address ending in #type=recovery switched it on, even typed by hand.)
 * It ends when the person leaves the reset page (router/index.js) or the
 * session ends (below), so it can't be used later in the same tab.
 *
 * Imported first in main.js, so it listens before Supabase reads the link.
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

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') remember()

  // logout, auto-logout...: the permission ends with the session
  if (event === 'SIGNED_OUT') endPasswordRecovery()
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
