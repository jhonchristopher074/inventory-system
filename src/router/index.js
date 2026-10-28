import { ref } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../lib/supabase'

import LoginView from '../views/auth/LoginView.vue'
import { isPasswordRecovery, endPasswordRecovery } from '../lib/passwordRecovery'
import { getPasswordStatus, EXPIRED_MESSAGE } from '../lib/passwordStatus'
import { isIdleExpired, markActivity, IDLE_MESSAGE } from '../lib/idleLogout'
import { wasBrowserClosed, markTabLoggedIn, CLOSED_MESSAGE } from '../lib/browserSession'

// Every page except Login is downloaded only when it's first opened, so the
// first load (the login screen) is much smaller, especially on phones.
const ChangePasswordView = () => import('../views/ChangePasswordView.vue')
const ResetPasswordView = () => import('../views/auth/ResetPasswordView.vue')

const DashboardView = () => import('../views/admin/DashboardView.vue')
const InventoryView = () => import('../views/admin/InventoryView.vue')
const CalendarView = () => import('../views/admin/CalendarView.vue')
const ApprovalView = () => import('../views/admin/ApprovalView.vue')
const DocumentationView = () => import('../views/admin/DocumentationView.vue')
const ArchivedView = () => import('../views/admin/ArchivedView.vue')
const ProfileView = () => import('../views/admin/ProfileView.vue')
const AdminPOSView = () => import('../views/admin/AdminPOSView.vue')
const AdminSalesHistoryView = () => import('../views/admin/AdminSalesHistoryView.vue')

const CashierDashboardView = () => import('../views/cashier/CashierDashboardView.vue')
const POSView = () => import('../views/cashier/POSView.vue')
const SalesHistoryView = () => import('../views/cashier/SalesHistoryView.vue')
const CashierProfileView = () => import('../views/cashier/CashierProfileView.vue')

const StaffDashboardView = () => import('../views/staff/StaffDashboardView.vue')
const StaffInventoryView = () => import('../views/staff/StaffInventoryView.vue')
const StaffCalendarView = () => import('../views/staff/StaffCalendarView.vue')
const StaffDocumentationView = () => import('../views/staff/StaffDocumentationView.vue')
const StaffProfileView = () => import('../views/staff/StaffProfileView.vue')

const SupplierDropBoxView = () => import('../views/supplier/SupplierDropBoxView.vue')

const routes = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/change-password', name: 'change-password', component: ChangePasswordView, meta: { requiresAuth: true } },
  // opened from a "Forgot password?" email; the page itself checks the link
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordView },

  { path: '/', component: DashboardView, meta: { requiresAuth: true, role: 'admin' } },
  { path: '/inventory', component: InventoryView, meta: { requiresAuth: true, role: 'admin' } },
  { path: '/calendar', component: CalendarView, meta: { requiresAuth: true, role: 'admin' } },
  { path: '/approval', component: ApprovalView, meta: { requiresAuth: true, role: 'admin' } },
  { path: '/documentation', component: DocumentationView, meta: { requiresAuth: true, role: 'admin' } },
  { path: '/archived', component: ArchivedView, meta: { requiresAuth: true, role: 'admin' } },
  { path: '/profile', component: ProfileView, meta: { requiresAuth: true, role: 'admin' } },
  { path: '/admin/pos', component: AdminPOSView, meta: { requiresAuth: true, role: 'admin' },},
  { path: '/admin/sales', component: AdminSalesHistoryView, meta: { requiresAuth: true, role: 'admin' },},

  { path: '/cashier', component: CashierDashboardView, meta: { requiresAuth: true, role: 'cashier' } },
  { path: '/cashier/pos', component: POSView, meta: { requiresAuth: true, role: 'cashier' } },
  { path: '/cashier/sales', component: SalesHistoryView, meta: { requiresAuth: true, role: 'cashier' } },
  { path: '/cashier/profile', component: CashierProfileView, meta: { requiresAuth: true, role: 'cashier' } },

  { path: '/staff', component: StaffDashboardView, meta: { requiresAuth: true, role: 'staff' } },
  { path: '/staff/inventory', component: StaffInventoryView, meta: { requiresAuth: true, role: 'staff' } },
  { path: '/staff/calendar', component: StaffCalendarView, meta: { requiresAuth: true, role: 'staff' } },
  { path: '/staff/documentation', component: StaffDocumentationView, meta: { requiresAuth: true, role: 'staff' } },
  { path: '/staff/profile', component: StaffProfileView, meta: { requiresAuth: true, role: 'staff' } },

  { path: '/SupplierDropBoxView', component: SupplierDropBoxView, meta: { requiresAuth: true, role: 'supplier' } },

  // a mistyped address: your home page (or the login page)
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

// The logged-in person's role, as found by the check below on every page
// change. The sidebar shows that role's menu from it, so there's no second
// lookup and no wrong menu showing first.
export const currentRole = ref('')

const HOME = {
  admin: '/',
  cashier: '/cashier',
  staff: '/staff',
  supplier: '/SupplierDropBoxView',
}

const BLOCKED_MESSAGE =
  'This account is disabled or not set up yet. Please contact the administrator.'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user

  if (!user) currentRole.value = ''

  if (to.meta.requiresAuth && !user) {
    return '/login'
  }

  if (!user) return

  // Opening a password-reset link is a fresh sign-in, not an old session
  // left open: restart the auto-logout clock instead of ending it.
  if (to.path === '/reset-password' && isPasswordRecovery()) {
    markActivity()
    markTabLoggedIn()
  }

  // Every tab of the app was closed since the login: end it.
  if (await wasBrowserClosed()) {
    await supabase.auth.signOut({ scope: 'local' })
    currentRole.value = ''
    if (to.path === '/login') return
    return { path: '/login', query: { notice: CLOSED_MESSAGE } }
  }

  // Still signed in, but nobody used the app for too long (this also
  // catches a browser that was closed without logging out): end it.
  if (isIdleExpired()) {
    await supabase.auth.signOut({ scope: 'local' })
    currentRole.value = ''
    if (to.path === '/login') return
    return { path: '/login', query: { notice: IDLE_MESSAGE } }
  }

  markActivity()

  // Came from a "Forgot password?" email: the reset page opens even for an
  // account that still has a temporary password (finishing the reset
  // clears it). Before, the rule below sent those accounts away first, so
  // an employee whose temporary password had expired could never reset it.
  if (to.path === '/reset-password' && isPasswordRecovery()) return

  // Temporary-password rule (applies to every role):
  // expired -> sign out; still temporary -> only the Change password page is allowed.
  const passwordStatus = getPasswordStatus(user)

  if (passwordStatus === 'expired') {
    await supabase.auth.signOut()
    currentRole.value = ''
    return { path: '/login', query: { notice: EXPIRED_MESSAGE } }
  }

  if (passwordStatus === 'must_change') {
    if (to.path === '/change-password') return
    return '/change-password'
  }

  if (to.path === '/change-password') return '/'

  const { data: profile, error } = await supabase.rpc('get_my_profile')

  // couldn't check (e.g. network): don't open role pages, but keep the session
  if (error) return to.meta.role ? false : undefined

  // Disabled (or hidden) by the admin, no profile, or no valid role:
  // end the session. Before, these users were let into every page.
  const home = profile ? HOME[profile.role] : null

  if (!home || profile.is_active === false || profile.is_hidden === true) {
    await supabase.auth.signOut()
    currentRole.value = ''
    if (to.path === '/login') return
    return { path: '/login', query: { notice: BLOCKED_MESSAGE } }
  }

  currentRole.value = profile.role

  if (to.path === '/login') return home

  if (to.meta.role && to.meta.role !== profile.role) return home
})

/* ------------------------------------------------------------------
   After a new version is uploaded, a tab that was opened before still asks
   for the old page files, which the upload removed. Instead of a page that
   won't open, load the new version (once per address, so a really missing
   file can't cause endless reloading).
------------------------------------------------------------------ */
const RELOAD_KEY = 'reloadedForNewVersion'

function isOldFileError(error) {
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    String(error?.message || error)
  )
}

function reloadForNewVersion(path) {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === path) return // already tried
    sessionStorage.setItem(RELOAD_KEY, path)
  } catch {
    // storage disabled: reload anyway
  }

  window.location.assign(path)
}

router.onError((error, to) => {
  if (isOldFileError(error)) reloadForNewVersion(to.fullPath)
})

router.afterEach((to, from, failure) => {
  // a page opened fine: allow the next new version to reload again
  try {
    sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    // ignore
  }

  // The reset-password permission is for the reset page only: leaving it
  // ends it, so it can't be used later in this tab (e.g. by the next
  // person on a shared computer).
  if (!failure && to.path !== '/reset-password') endPasswordRecovery()
})

export default router