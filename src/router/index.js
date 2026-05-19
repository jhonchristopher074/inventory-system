import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../lib/supabase'

import LoginView from '../views/auth/LoginView.vue'

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

const routes = [
  { path: '/login', component: LoginView },

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
]

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role

  if (to.path === '/login') {
    if (role === 'admin') return '/'
    if (role === 'cashier') return '/cashier'
    if (role === 'staff') return '/staff'
  }

  if (to.meta.role && to.meta.role !== role) {
    if (role === 'admin') return '/'
    if (role === 'cashier') return '/cashier'
    if (role === 'staff') return '/staff'
  }
})

export default router