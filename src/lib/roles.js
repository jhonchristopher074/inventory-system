// What each role is called on screen. The owner's role is 'admin' in the
// database (every security rule checks that), so only the name shown
// changes: the shop's owner is "Owner" everywhere in the app.

export const ROLE_LABELS = {
  admin: 'Owner',
  // runs the store like the Owner, without the accounts (see
  // supabase/migrations/20261114000001_manager_role.sql)
  manager: 'Manager',
  cashier: 'Cashier',
  staff: 'Staff',
  supplier: 'Supplier',
}

// Each role's colour (the tone-* classes in style.css): the same on its
// dashboard (DashboardHero), in the top bar and on the Profile page.
export const ROLE_TONES = {
  admin: 'red',
  manager: 'amber',
  staff: 'violet',
  cashier: 'green',
  supplier: 'blue',
}

export function roleTone(role) {
  return ROLE_TONES[String(role || '').trim()] || 'red'
}

// the pages a role uses: a Manager uses the Owner's
export function pageRole(role) {
  return role === 'manager' ? 'admin' : role
}

export function roleLabel(role) {
  const key = String(role || '').trim()
  return ROLE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '')
}
