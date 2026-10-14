import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../lib/supabase'

import LoginView from '../views/auth/LoginView.vue'
import ChangePasswordView from '../views/ChangePasswordView.vue'
import { getPasswordStatus, EXPIRED_MESSAGE } from '../lib/passwordStatus'

import DashboardView from '../views/admin/DashboardView.vue'
import InventoryView from '../views/admin/InventoryView.vue'
import CalendarView from '../views/admin/CalendarView.vue'
import ApprovalView from '../views/admin/ApprovalView.vue'
import DocumentationView from '../views/admin/DocumentationView.vue'
import ArchivedView from '../views/admin/ArchivedView.vue'
import ProfileView from '../views/admin/ProfileView.vue'
import AdminPOSView from '../views/admin/AdminPOSView.vue'
import AdminSalesHistoryView from '../views/admin/AdminSalesHistoryView.vue'

import CashierDashboardView from '../views/cashier/CashierDashboardView.vue'
import POSView from '../views/cashier/POSView.vue'
import SalesHistoryView from '../views/cashier/SalesHistoryView.vue'
import CashierProfileView from '../views/cashier/CashierProfileView.vue'

import StaffDashboardView from '../views/staff/StaffDashboardView.vue'
import StaffInventoryView from '../views/staff/StaffInventoryView.vue'
import StaffCalendarView from '../views/staff/StaffCalendarView.vue'
import StaffDocumentationView from '../views/staff/StaffDocumentationView.vue'
import StaffProfileView from '../views/staff/StaffProfileView.vue'

import SupplierDropBoxView from '../views/supplier/SupplierDropBoxView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView },
  { path: '/change-password', name: 'change-password', component: ChangePasswordView, meta: { requiresAuth: true } },

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

  
]

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

  if (to.meta.requiresAuth && !user) {
    return '/login'
  }

  if (!user) return

  // Temporary-password rule (applies to every role):
  // expired -> sign out; still temporary -> only the Change password page is allowed.
  const passwordStatus = getPasswordStatus(user)

  if (passwordStatus === 'expired') {
    await supabase.auth.signOut()
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
    if (to.path === '/login') return
    return { path: '/login', query: { notice: BLOCKED_MESSAGE } }
  }

  if (to.path === '/login') return home

  if (to.meta.role && to.meta.role !== profile.role) return home
})

export default router