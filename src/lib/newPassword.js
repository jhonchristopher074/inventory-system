// Saves a new password for the logged-in person.
//
// Supabase refuses it from a login that hasn't entered the authenticator
// app's code: the Owner after a "Forgot password?" email, or after logging
// in with the email code. Then the server saves it instead
// (supabase/functions/set-password), after its own checks.
//
// Returns { loggedOut }: a password saved by the server ends every login,
// this one too, so the page sends the person to log in again.
import { supabase } from './supabase'

function needsAppCode(error) {
  return error?.code === 'insufficient_aal' || /aal2|insufficient_aal/i.test(error?.message || '')
}

export async function saveNewPassword(newPassword, currentPassword = '') {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (!error) return { loggedOut: false }
  if (!needsAppCode(error)) throw error

  const { error: fnError } = await supabase.functions.invoke('set-password', {
    body: { new_password: newPassword, current_password: currentPassword || undefined },
  })
  if (fnError) {
    let message = 'Could not save the password. Please try again.'
    try {
      message = (await fnError.context.json()).error || message
    } catch {
      // keep the plain message
    }
    throw new Error(message)
  }
  return { loggedOut: true }
}
