// Reads the temporary-password status from the logged-in user's app_metadata.
// app_metadata is set by the server and cannot be edited by the user.

export function getPasswordStatus(user) {
  const meta = user?.app_metadata ?? {}
  if (!meta.must_change_password) return 'ok'
  const expires = meta.temp_password_expires_at ? Date.parse(meta.temp_password_expires_at) : 0
  if (!expires || Date.now() > expires) return 'expired'
  return 'must_change'
}

export const EXPIRED_MESSAGE =
  'Your temporary password has expired. Please ask an administrator to issue a new one.'

// Call this right after a successful signInWithPassword() on your Login page.
// Returns the route to go to, or throws with a user-friendly message.
export async function afterLogin(supabase, user) {
  const status = getPasswordStatus(user)
  if (status === 'expired') {
    await supabase.auth.signOut()
    throw new Error(EXPIRED_MESSAGE)
  }
  if (status === 'must_change') return { name: 'change-password' }
  return null // continue with your normal post-login redirect
}

// Same rules as the server (supabase/functions/_shared/auth.ts).
export const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'A number (0–9)', test: (p) => /[0-9]/.test(p) },
  { label: 'A symbol (e.g. ! @ # $)', test: (p) => /[^A-Za-z0-9]/.test(p) },
]