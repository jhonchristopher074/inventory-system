// What each role is called on screen. The owner's role is 'admin' in the
// database (every security rule checks that), so only the name shown
// changes: the shop's owner is "Owner" everywhere in the app.

export const ROLE_LABELS = {
  admin: 'Owner',
  cashier: 'Cashier',
  staff: 'Staff',
  supplier: 'Supplier',
}

export function roleLabel(role) {
  const key = String(role || '').trim()
  return ROLE_LABELS[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : '')
}
