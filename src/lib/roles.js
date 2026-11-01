// What each role is called on screen. The owner's role is 'admin' in the
// database (every security rule checks that), so only the name shown
// changes: the shop's owner is "Owner" everywhere in the app.

export const ROLE_LABELS = {
  admin: 'Owner',
  cashier: 'Cashier',
  staff: 'Staff',
  supplier: 'Supplier',
}

// Each role's colour (the tone-* classes in style.css): the same on its
// dashboard (DashboardHero), in the top bar and on the Profile page.
export const ROLE_TONES = {
  admin: 'red',
  staff: 'violet',
  cashier: 'green',
  supplier: 'blue',
}

export function roleTone(role) {
  return ROLE_TONES[String(role || '').trim()] || 'red'
}

export function roleLabel(role) {
  const key = String(role || '').trim()
  return ROLE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '')
}
