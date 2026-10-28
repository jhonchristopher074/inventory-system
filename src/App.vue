<template>
  <!-- until the first page is known (same look as the one in index.html) -->
  <div v-if="!started" class="boot-loading">Loading…</div>

  <!-- full-screen pages: no sidebar (its links don't work there anyway) -->
  <RouterView
    v-else-if="['/login', '/change-password', '/reset-password'].includes($route.path)"
  />

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

          <button class="logout-btn" type="button" data-label="Logout" @click="askLogout">
            <NavIcon name="logout" class="nav-ico" />
            <span class="nav-text">Logout</span>
          </button>
        </nav>
      </aside>

      <!-- LOGOUT: asks first, so a mis-click doesn't end the session -->
      <div
        v-if="confirmingLogout"
        class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-4"
        @click.self="cancelLogout"
        @keydown.esc="cancelLogout"
      >
        <div
          class="w-full max-w-sm rounded-[24px] border border-white/10 bg-zinc-900 p-6 shadow-2xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="logout-title"
          aria-describedby="logout-text"
        >
          <h2 id="logout-title" class="text-xl font-bold text-white">
            Are you sure you want to log out?
          </h2>

          <p id="logout-text" class="mt-2 text-sm leading-relaxed text-zinc-400">
            You will need your email and password to log in again.
          </p>

          <p
            v-if="logoutError"
            class="mt-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400"
            role="alert"
          >
            {{ logoutError }}
          </p>

          <!-- Log out first on phones (top), on the right on computers -->
          <div class="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              ref="logoutButton"
              type="button"
              class="flex-1 rounded-2xl bg-red-600 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="loggingOut"
              @click="logout"
            >
              {{ loggingOut ? 'Logging out…' : 'Log out' }}
            </button>

            <button
              type="button"
              class="flex-1 rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
              :disabled="loggingOut"
              @click="cancelLogout"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { supabase } from './lib/supabase'
import NotificationBell from './components/NotificationBell.vue'
import NavIcon from './components/NavIcon.vue'
import { watchIdle, IDLE_MESSAGE } from './lib/idleLogout'
import { confirmLeave } from './lib/leaveGuard'
import { currentRole } from './router'

const router = useRouter()
const route = useRoute()

// set by the router's check on every page change ('' = not logged in)
const role = currentRole

// Nothing is shown until the first page is known. Before, the sidebar and
// the notification bell flashed on every load (even on the login page,
// where their requests failed) while the router was still deciding.
const started = ref(false)
router.isReady().finally(() => {
  started.value = true
})

/* ------------------------------------------------------------------
   Sidebar collapse
   Remembered in localStorage, and auto-collapsed on narrow screens.
------------------------------------------------------------------ */
const STORAGE_KEY = 'sidebarCollapsed'
const NARROW = 1024

const collapsed = ref(false)
// only auto-collapse until the user makes their own choice on this screen size
let userChoseState = false

// stops the auto-logout watcher (started in onMounted)
let stopIdleWatch = null

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
  let saved

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
  stopIdleWatch = watchIdle(idleLogout)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', applyWidth)
  stopIdleWatch?.()
})

/* ------------------------------------------------------------------
   Auto-logout after a while without activity (see lib/idleLogout.js)
------------------------------------------------------------------ */
async function idleLogout() {
  if (route.path === '/login') return

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return

  // 'local': only this browser. A plain signOut() would also log the same
  // account out on every other device.
  await supabase.auth.signOut({ scope: 'local' })
  router.replace({ path: '/login', query: { notice: IDLE_MESSAGE } })
}

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
    {
      section: 'Account',
      items: [{ to: '/supplier/profile', label: 'Profile', icon: 'profile' }],
    },
  ],
}

const navGroups = computed(() => NAV[role.value] || [])

/* ------------------------------------------------------------------
   Session: Logout asks "Are you sure you want to log out?" first
------------------------------------------------------------------ */
const confirmingLogout = ref(false)
const loggingOut = ref(false)
const logoutError = ref('')
const logoutButton = ref(null)

async function askLogout() {
  logoutError.value = ''
  confirmingLogout.value = true

  // focus is inside the window, so Esc closes it and Enter logs out
  await nextTick()
  logoutButton.value?.focus()
}

function cancelLogout() {
  if (loggingOut.value) return
  confirmingLogout.value = false
}

// Closes on any page change, e.g. the idle timer logged out while it was
// open: otherwise it would still be there after the next login.
watch(
  () => route.path,
  () => {
    confirmingLogout.value = false
  }
)

async function logout() {
  if (loggingOut.value) return

  // e.g. the Approval page asks first while receipts are still being sent
  if (!(await confirmLeave())) {
    confirmingLogout.value = false
    return
  }

  loggingOut.value = true
  logoutError.value = ''

  const { error } = await supabase.auth.signOut()

  loggingOut.value = false

  // e.g. no connection: still logged in, so say so instead of doing nothing
  if (error) {
    logoutError.value = `Couldn't log out: ${error.message}`
    return
  }

  confirmingLogout.value = false
  router.push('/login')
}
</script>
