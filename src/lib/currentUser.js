// The logged-in person as this browser remembers them (localStorage
// "currentUser"): their name goes on sales, inspections and reports, in the
// top bar and in the dashboard's greeting.
//
// Saved at login, and again on every page change from the profile the
// router checks anyway (router/index.js). Before, it was only saved at
// login, so after the Owner renamed an account the old name stayed until
// that person logged in again.
import { ref } from 'vue'

function read() {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || '{}') || {}
  } catch {
    return {}
  }
}

// the same, live: what shows it (the top bar) updates when it changes
export const currentUser = ref(read())

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
    localStorage.setItem('currentUser', JSON.stringify(user))
    // older single keys, kept as they were
    localStorage.setItem('user_id', profile.id)
    localStorage.setItem('full_name', profile.full_name)
    localStorage.setItem('email', profile.email)
    localStorage.setItem('role', profile.role)
  } catch {
    // storage blocked: names fall back to the email / role
  }
}
