/**
 * Log out when the browser app was closed.
 *
 * Supabase keeps the login in localStorage, which survives closing the
 * browser. To end it on close, logging in also sets a "session cookie" (a
 * cookie with no expiry date). The browser keeps it while the browser app is
 * open, in every tab, and deletes it when the browser app is closed.
 *
 *   - refresh, open another tab, close a tab → cookie still there → stay logged in
 *   - close the browser app, open it again   → cookie gone → logged out
 */

const COOKIE = 'browserLoggedIn'

/** Call right after a successful login. */
export function markLoggedIn() {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  // no expires / max-age: deleted when the browser app closes
  document.cookie = `${COOKIE}=1; path=/; SameSite=Lax${secure}`
}

/** true = the browser app was closed since the login, so end the saved login. */
export function wasBrowserClosed() {
  if (!navigator.cookieEnabled) return false // cookies blocked: can't tell, so don't log out
  return !document.cookie.split('; ').includes(`${COOKIE}=1`)
}

export const CLOSED_MESSAGE = 'You were logged out because the browser was closed. Please log in again.'
