// The logged-in person (id, name, email, role): their name goes on sales,
// inspections and reports, in the top bar and in the dashboard's greeting.
//
// Kept for this browser tab only (sessionStorage), never in the browser's
// lasting storage: closing the tab or logging out forgets it. A new tab
// gets it again on its first page, because the router checks the profile
// on every page change and saves it here (router/index.js).
import { ref } from 'vue'

const KEY = 'currentUser'

// Older versions kept the account in localStorage (which lasts until it's
// cleared), and the login page could remember the email. Both are removed
// the first time this version runs.
try {
  for (const old of ['currentUser', 'user_id', 'full_name', 'email', 'role', 'rememberedEmail']) {
    localStorage.removeItem(old)
  }
} catch {
  // storage blocked: there's nothing saved either
}

function read() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}
  } catch {
    return {}
  }
}

// the same, live: what shows it (the top bar) updates when it changes
export const currentUser = ref(read())

// for code that only needs it once: { id, full_name, email, role, is_active }
// ({} when nobody is logged in)
export function readCurrentUser() {
  return { ...currentUser.value }
}

export function saveCurrentUser(profile) {
  if (!profile) return

  const user = {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: profile.role,
    is_active: profile.is_active,
  }
  currentUser.value = user

  try {
    sessionStorage.setItem(KEY, JSON.stringify(user))
  } catch {
    // storage blocked: kept in memory for this page only
  }
}

// logged out (or the session ended)
export function clearCurrentUser() {
  currentUser.value = {}
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to remove
  }
}
