// Guest mode: look around the system without an account. View only, and on
// sample data (lib/demoClient.js), never the store's real data.
//
// The guest picks a role on the login page (startGuest). It lasts for this
// browser tab (sessionStorage); Exit or Logout ends it (endGuest). Both
// reload the page, so lib/supabase.js picks the right client.

const KEY = 'guestMode'

export const GUEST_ROLES = [
  { role: 'admin', label: 'Owner', hint: 'Dashboard, inventory, approvals, sales' },
  { role: 'manager', label: 'Manager', hint: 'Runs the store; accounts: disable / enable only' },
  { role: 'staff', label: 'Staff', hint: 'Inspections, deliveries, receipts' },
  { role: 'cashier', label: 'Cashier', hint: 'POS and sales' },
  { role: 'supplier', label: 'Supplier', hint: 'Upload receipts' },
]

// 'admin' | 'manager' | 'staff' | 'cashier' | 'supplier', or '' when not a guest
export function guestRole() {
  try {
    const role = sessionStorage.getItem(KEY) || ''
    return GUEST_ROLES.some((option) => option.role === role) ? role : ''
  } catch {
    return ''
  }
}

export function isGuest() {
  return Boolean(guestRole())
}

export function guestRoleLabel() {
  return GUEST_ROLES.find((option) => option.role === guestRole())?.label || ''
}

export function startGuest(role, onReady) {
  try {
    sessionStorage.setItem(KEY, role)
  } catch {
    return
  }
  onReady?.()
  location.assign('/')
}

export function endGuest() {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem('currentUser')
  } catch {
    // nothing saved
  }
  location.assign('/login')
}

export const GUEST_MESSAGE = 'Guest mode is view only: nothing was changed.'
