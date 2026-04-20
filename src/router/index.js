import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import InventoryView from '../views/InventoryView.vue'
import CalendarView from '../views/CalendarView.vue'
import DeletedView from '../views/DeletedView.vue'
import ScannerView from '../views/ScannerView.vue'
import ProfileView from '../views/ProfileView.vue'

const routes = [
  { path: '/', component: DashboardView },
  { path: '/inventory', component: InventoryView },
  { path: '/calendar', component: CalendarView },
  { path: '/scanner', component: ScannerView },
  { path: '/deleted', component: DeletedView },
  { path: '/profile', component: ProfileView },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router