import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from '../views/DashboardView.vue'
import InventoryView from '../views/InventoryView.vue'
import CalendarView from '../views/CalendarView.vue'
import DocumentationView from '../views/DocumentationView.vue'
import ArchivedView from '../views/ArchivedView.vue'
import ProfileView from '../views/ProfileView.vue'

const routes = [
  {
    path: '/',
    component: DashboardView,
  },
  {
    path: '/inventory',
    component: InventoryView,
  },
  {
    path: '/calendar',
    component: CalendarView,
  },
  {
    path: '/documentation',
    component: DocumentationView,
  },
  {
    path: '/archived',
    component: ArchivedView,
  },
  {
    path: '/profile',
    component: ProfileView,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router