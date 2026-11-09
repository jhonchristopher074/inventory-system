<template>
  <!-- until the first page is known (same look as the one in index.html) -->
  <div v-if="!started" class="boot-loading">Loading…</div>

  <!-- full-screen pages: no sidebar (its links don't work there anyway) -->
  <RouterView
    v-else-if="['/login', '/change-password', '/reset-password', '/two-step'].includes($route.path)"
  />

  <div v-else class="min-h-screen text-white app-scale">
    <div class="app-shell" :class="{ collapsed }">
      <!-- phones: the open menu floats over the page; tap beside it to close -->
      <div v-if="!collapsed" class="side-scrim" aria-hidden="true" @click="closeOnPhone"></div>

      <aside class="app-side">
        <div class="side-top">
          <div class="brand-card">
            <img :src="logoUrl" alt="" class="brand-mark" width="40" height="40" @error="showDefaultLogo" />
            <div class="brand-name">
              <h1 class="brand-title">10 <span>FIVE</span> 7</h1>
              <p class="brand-sub">Hardware</p>
            </div>
            <p class="brand-note">Inventory Management System</p>
          </div>

          <!-- the sidebar folded to icons shows the logo only -->
          <img :src="logoUrl" alt="10 FIVE 7 Hardware" class="side-mark" width="32" height="32" @error="showDefaultLogo" />

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
              :data-label="badgeOf(item.to)?.hint ? `${item.label} · ${badgeOf(item.to).hint}` : item.label"
              :aria-label="badgeOf(item.to)?.hint ? `${item.label}: ${badgeOf(item.to).hint}` : undefined"
            >
              <NavIcon :name="item.icon" class="nav-ico" />
              <span class="nav-text">{{ item.label }}</span>
              <!-- what's waiting here (lib/taskCounts.js) -->
              <span
                v-if="badgeOf(item.to)"
                class="nav-badge"
                :class="`nav-badge-${badgeOf(item.to).tone}`"
                :title="badgeOf(item.to).hint"
                aria-hidden="true"
              >
                {{ badgeOf(item.to).n > 99 ? '99+' : badgeOf(item.to).n }}
              </span>
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

      <main ref="mainArea" class="app-main">
        <!-- the store's logo, big and faint, in the middle behind every page -->
        <img :src="logoUrl" alt="" aria-hidden="true" class="app-watermark" @error="showDefaultLogo" />

        <!-- guest mode: say so on every page, with a way out -->
        <div v-if="guest" class="guest-banner" role="status">
          <span class="guest-banner-dot" aria-hidden="true"></span>
          <p class="min-w-0 flex-1">
            <b>Guest mode</b> · looking around as {{ guestLabel }} · view only, sample data
          </p>
          <button type="button" class="guest-banner-btn" @click="leaveGuest">Exit guest mode</button>
        </div>

        <!-- top right: the bell, then who is logged in (name, role). On a
             computer it sits inside the top-right corner of the page's
             header (page-head), which keeps room for it: no row of its own.
             Phones and guest mode (the banner is on top): its own row. -->
        <div
          ref="topbar"
          class="app-topbar mb-5 flex items-center justify-end gap-3"
          :class="{ 'is-floating': !guest }"
        >
          <NotificationBell class="shrink-0" />

          <!-- who is logged in: name, role and the role's colour -->
          <CurrentUserBadge
            :role="role"
            :name="currentUser.full_name"
            :email="currentUser.email"
            :to="profileLink"
          />
        </div>

        <RouterView />
      </main>
    </div>
  </div>
  <ToastHost />
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { endGuest, guestRoleLabel, isGuest } from './lib/guestMode'
import { supabase } from './lib/supabase'
import NotificationBell from './components/NotificationBell.vue'
import NavIcon from './components/NavIcon.vue'
import { watchIdle, IDLE_MESSAGE } from './lib/idleLogout'
import { confirmLeave } from './lib/leaveGuard'
import { currentRole } from './router'
import { currentUser } from './lib/currentUser'
import CurrentUserBadge from './components/CurrentUserBadge.vue'
import ToastHost from './components/ToastHost.vue'
import { clearTasks, refreshTasksSoon, taskBadges } from './lib/taskCounts'
import { loadStoreLogo, logoUrl, showDefaultLogo } from './lib/storeLogo'

const router = useRouter()
const route = useRoute()

// a phone: going to another page closes the menu
watch(() => route.path, closeOnPhone)

/* ------------------------------------------------------------------
   What's waiting (lib/taskCounts.js): numbers on the menu and in the
   browser tab. Counted again on every page change, every minute, back on
   the tab, and when a notification arrives (NotificationBell).
------------------------------------------------------------------ */
function badgeOf(path) {
  const badge = taskBadges.byPath[path]
  return badge && badge.n > 0 ? badge : null
}

watch(
  [() => currentRole.value, () => route.path],
  ([who]) => {
    if (who) refreshTasksSoon(who)
    else clearTasks()
  },
  { immediate: true }
)

const BASE_TITLE = document.title
watch(
  () => taskBadges.total,
  (total) => {
    document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE
  },
  { immediate: true }
)

let taskTimer = null

function onTaskVisibility() {
  if (document.visibilityState === 'visible' && currentRole.value) refreshTasksSoon(currentRole.value)
}

onMounted(() => {
  taskTimer = setInterval(() => {
    if (currentRole.value && document.visibilityState === 'visible') refreshTasksSoon(currentRole.value)
  }, 60 * 1000)
  document.addEventListener('visibilitychange', onTaskVisibility)
})

onBeforeUnmount(() => {
  clearInterval(taskTimer)
  document.removeEventListener('visibilitychange', onTaskVisibility)
})

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

// a phone (the same 760px as the phone layout in style.css)
function isPhone() {
  return window.matchMedia('(max-width: 760px)').matches
}

// On a phone the menu floats over the page, so it starts closed on every
// page and isn't remembered (a remembered "open" covered the next page).
function closeOnPhone() {
  if (isPhone()) collapsed.value = true
}

function toggleSidebar() {
  collapsed.value = !collapsed.value
  if (isPhone()) return
  userChoseState = true

  try {
    localStorage.setItem(STORAGE_KEY, collapsed.value ? '1' : '0')
  } catch {
    // private mode / storage disabled — the toggle still works for this session
  }
}

function applyWidth() {
  if (isPhone()) {
    collapsed.value = true
    return
  }
  if (userChoseState) return
  collapsed.value = window.innerWidth < NARROW
}

// the Owner's logo, if one was uploaded (lib/storeLogo.js)
loadStoreLogo()

onMounted(() => {
  let saved

  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    saved = null
  }

  if (isPhone()) {
    collapsed.value = true
  } else if (saved === '1' || saved === '0') {
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
// guest mode (lib/guestMode.js): set when the page loads
const guest = isGuest()
const guestLabel = guestRoleLabel()

function leaveGuest() {
  endGuest()
}

async function idleLogout() {
  if (route.path === '/login') return
  if (guest) return leaveGuest()

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
      items: [
        { to: '/activity', label: 'Activity Log', icon: 'history' },
        { to: '/profile', label: 'Profile', icon: 'profile' },
      ],
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
        { to: '/staff/receipts', label: 'Receipts', icon: 'upload' },
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

// a Manager: the Owner's menu without the Activity log (Profile & Users
// shows him fewer actions)
NAV.manager = NAV.admin.map((group) => ({
  ...group,
  items: group.items.filter((item) => item.to !== '/activity'),
}))

const navGroups = computed(() => NAV[role.value] || [])

// the role's own Profile page (the top bar's name opens it)
// The bell and name inside the page's header (computers): the header keeps
// room for them (--topbar-w: their width; a long name is wider), and they
// sit in the middle of its height (--topbar-top), whatever page it is.
const topbar = ref(null)
const mainArea = ref(null)
let sizeWatch = null
let watchedHead = null

function placeTopbar() {
  const bar = topbar.value
  const main = mainArea.value
  if (!bar || !main) return
  main.style.setProperty('--topbar-w', `${Math.ceil(bar.offsetWidth)}px`)

  const head = main.querySelector('.page-head')
  if (head) {
    const top = head.offsetTop + (head.offsetHeight - bar.offsetHeight) / 2
    main.style.setProperty('--topbar-top', `${Math.max(0, Math.round(top))}px`)
  }

  // a new page: follow its header's size (a subtitle that wraps, …)
  if (head !== watchedHead && sizeWatch) {
    if (watchedHead) sizeWatch.unobserve(watchedHead)
    if (head) sizeWatch.observe(head)
    watchedHead = head
  }
}

watch(topbar, (el) => {
  sizeWatch?.disconnect()
  watchedHead = null
  if (!el || typeof ResizeObserver === 'undefined') return
  sizeWatch = new ResizeObserver(placeTopbar)
  sizeWatch.observe(el)
  placeTopbar()
})

// pages load on demand: look for the new header for a moment after each change
watch(
  () => route.fullPath,
  () => {
    const before = watchedHead
    let tries = 0
    const look = () => {
      placeTopbar()
      // until the new page's header is there (half a second at most)
      const found = watchedHead && watchedHead !== before && watchedHead.isConnected
      if (!found && ++tries < 30) requestAnimationFrame(look)
    }
    nextTick(look)
  }
)

onBeforeUnmount(() => sizeWatch?.disconnect())

const profileLink = computed(
  () => navGroups.value.flatMap((group) => group.items).find((item) => item.icon === 'profile')?.to || '/'
)

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

  // a guest: back to the login page, guest mode over
  if (guest) return leaveGuest()

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

<style scoped>
/* guest mode: a strip across the top of every page */
.guest-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
  border-radius: 14px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(56, 189, 248, 0.08);
  padding: 0.55rem 0.6rem 0.55rem 0.9rem;
  font-size: 0.85rem;
  color: #cdeffd;
}

.guest-banner b {
  color: #fff;
}

.guest-banner-dot {
  width: 0.55rem;
  height: 0.55rem;
  flex: none;
  border-radius: 999px;
  background: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25);
}

.guest-banner-btn {
  flex: none;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
}

.guest-banner-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}
</style>
