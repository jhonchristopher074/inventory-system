<template>
  <RouterView v-if="$route.path === '/login'" />

  <div v-else class="min-h-screen text-white app-scale">
    <div class="app-shell" :class="{ collapsed }">
      <aside class="app-side">
        <div class="side-top">
          <div class="brand-card">
            <h1 class="brand-title">10 <span>FIVE</span> 7</h1>
            <p class="brand-sub">Hardware</p>
            <p class="brand-note">Inventory Management System</p>
          </div>

          <button
            class="side-toggle"
            type="button"
            :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            :aria-expanded="!collapsed"
            @click="toggleSidebar"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <nav class="flex flex-col">
          <template v-for="group in navGroups" :key="group.section">
            <p class="nav-section">{{ group.section }}</p>

            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="nav-link"
              active-class="active-link"
              :data-label="item.label"
            >
              <NavIcon :name="item.icon" class="nav-ico" />
              <span class="nav-text">{{ item.label }}</span>
            </RouterLink>
          </template>

          <button class="logout-btn" type="button" data-label="Logout" @click="logout">
            <NavIcon name="logout" class="nav-ico" />
            <span class="nav-text">Logout</span>
          </button>
        </nav>
      </aside>

      <main class="app-main">
        <div class="mb-5 flex items-center justify-between gap-4">
          <div
            class="flex items-center gap-3 rounded-full border border-white/10 bg-zinc-900/80 py-1.5 pl-2 pr-5 backdrop-blur"
          >
            <span
              class="grid h-9 w-9 place-items-center rounded-full bg-red-600 text-sm font-extrabold uppercase text-white"
            >
              {{ role.charAt(0) }}
            </span>
            <span class="leading-tight">
              <span class="block text-[0.68rem] uppercase tracking-[0.14em] text-zinc-500">
                Logged in as
              </span>
              <span class="block text-sm font-bold capitalize text-white">{{ role }}</span>
            </span>
          </div>

          <NotificationBell />
        </div>

        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { supabase } from './lib/supabase'
import NotificationBell from './components/NotificationBell.vue'
import NavIcon from './components/NavIcon.vue'

const router = useRouter()
const route = useRoute()

const role = ref('staff')

/* ------------------------------------------------------------------
   Sidebar collapse
   Remembered in localStorage, and auto-collapsed on narrow screens.
------------------------------------------------------------------ */
const STORAGE_KEY = 'sidebarCollapsed'
const NARROW = 1024

const collapsed = ref(false)
// only auto-collapse until the user makes their own choice on this screen size
let userChoseState = false

function toggleSidebar() {
  collapsed.value = !collapsed.value
  userChoseState = true

  try {
    localStorage.setItem(STORAGE_KEY, collapsed.value ? '1' : '0')
  } catch {
    // private mode / storage disabled — the toggle still works for this session
  }
}

function applyWidth() {
  if (userChoseState) return
  collapsed.value = window.innerWidth < NARROW
}

onMounted(() => {
  let saved = null

  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    saved = null
  }

  if (saved === '1' || saved === '0') {
    collapsed.value = saved === '1'
    userChoseState = true
  } else {
    applyWidth()
  }

  window.addEventListener('resize', applyWidth)
  getUserRole()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', applyWidth)
})

/* ------------------------------------------------------------------
   Navigation, per role
------------------------------------------------------------------ */
const NAV = {
  admin: [
    {
      section: 'Overview',
      items: [
        { to: '/', label: 'Dashboard', icon: 'dashboard' },
        { to: '/inventory', label: 'Inventory', icon: 'inventory' },
        { to: '/archived', label: 'Archived', icon: 'archive' },
      ],
    },
    {
      section: 'Selling',
      items: [
        { to: '/admin/pos', label: 'POS', icon: 'pos' },
        { to: '/admin/sales', label: 'Sales History', icon: 'sales' },
      ],
    },
    {
      section: 'Inspection',
      items: [
        { to: '/calendar', label: 'Calendar', icon: 'calendar' },
        { to: '/approval', label: 'Approval', icon: 'approval' },
        { to: '/documentation', label: 'Documentation', icon: 'docs' },
      ],
    },
    {
      section: 'Account',
      items: [{ to: '/profile', label: 'Profile', icon: 'profile' }],
    },
  ],

  cashier: [
    {
      section: 'Overview',
      items: [{ to: '/cashier', label: 'Dashboard', icon: 'dashboard' }],
    },
    {
      section: 'Selling',
      items: [
        { to: '/cashier/pos', label: 'POS', icon: 'pos' },
        { to: '/cashier/sales', label: 'Sales History', icon: 'sales' },
      ],
    },
    {
      section: 'Account',
      items: [{ to: '/cashier/profile', label: 'Profile', icon: 'profile' }],
    },
  ],

  staff: [
    {
      section: 'Overview',
      items: [
        { to: '/staff', label: 'Dashboard', icon: 'dashboard' },
        { to: '/staff/inventory', label: 'Inventory', icon: 'inventory' },
      ],
    },
    {
      section: 'Inspection',
      items: [
        { to: '/staff/calendar', label: 'Inspection Calendar', icon: 'calendar' },
        { to: '/staff/documentation', label: 'Documentation', icon: 'docs' },
      ],
    },
    {
      section: 'Account',
      items: [{ to: '/staff/profile', label: 'Profile', icon: 'profile' }],
    },
  ],

  supplier: [
    {
      section: 'Overview',
      items: [{ to: '/SupplierDropBoxView', label: 'Dashboard', icon: 'dashboard' }],
    },
  ],
}

const navGroups = computed(() => NAV[role.value] || NAV.supplier)

/* ------------------------------------------------------------------
   Session
------------------------------------------------------------------ */
async function getUserRole() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user

  if (!user) {
    role.value = 'staff'
    return
  }

  const { data, error } = await supabase.rpc('get_my_role')

  if (error) {
    console.error('ROLE ERROR:', error)
    role.value = 'staff'
    return
  }

  role.value = data || 'staff'
}

async function logout() {
  await supabase.auth.signOut()
  role.value = 'staff'
  router.push('/login')
}

watch(
  () => route.path,
  () => {
    getUserRole()
  }
)
</script>
