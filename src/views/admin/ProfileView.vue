<template>
  <div>
    <!-- HEADER -->
    <div class="mb-5 card p-5">
      <h1 class="text-3xl font-extrabold text-white">
        Profile & Users
      </h1>

      <p class="mt-1 text-sm text-zinc-400">
        Manage owner, cashier, and staff accounts.
      </p>
    </div>

    <!-- MAIN -->
    <!-- minmax(0, …): a column may shrink to the screen; otherwise the
         swipeable tab row widened the whole page on phones -->
    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">

      <!-- ADD USER: the server generates a one-time temporary password.
           Phones: behind a button, so the user list isn't pushed down. -->
      <div class="lg:sticky lg:top-5">
        <button
          type="button"
          class="phone-only w-full rounded-2xl bg-red-600 py-3 font-bold text-white hover:bg-red-700"
          :aria-expanded="showCreateForm"
          @click="showCreateForm = !showCreateForm"
        >
          {{ showCreateForm ? '✕ Close' : '+ Add employee' }}
        </button>

        <!-- hidden with CSS, not v-if: the new temporary password popup
             belongs to this form and must stay open after "Create account" -->
        <div :class="showCreateForm ? 'mt-3' : 'desktop-only'">
          <CreateEmployeeForm @created="fetchUsers" />
        </div>
      </div>

      <!-- USERS -->
      <div class="card flex min-w-0 flex-col p-5 lg:h-[calc(100vh-250px)] lg:min-h-[460px]">

        <!-- TOP -->
        <div class="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-extrabold text-white">User Accounts</h2>
            <p class="text-xs text-zinc-500">
              {{ users.length }} accounts
            </p>
          </div>

          <button
            class="flex items-center gap-2 rounded-xl border border-white/5 bg-zinc-800/70 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50"
            :disabled="loading"
            @click="fetchUsers"
          >
            <span class="inline-block" :class="loading ? 'animate-spin' : ''">↻</span>
            Refresh
          </button>
        </div>

        <!-- SEARCH -->
        <div class="mb-3">
          <input
            v-model="userSearch"
            type="text"
            placeholder="Search by account number, name, or email..."
            class="input"
          />
          <p v-if="userSearch" class="mt-1.5 text-xs text-zinc-500">
            {{ filteredUsers.length }} of {{ users.length }} accounts
          </p>
        </div>

        <!-- CATEGORY TABS: one row you can swipe on phones, wrapping on bigger screens -->
        <div class="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition"
            :class="activeTab === tab.key
              ? 'bg-red-600 text-white'
              : 'bg-zinc-800/70 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
            <span
              class="rounded-full px-1.5 text-[10px] leading-4"
              :class="activeTab === tab.key ? 'bg-white/20' : 'bg-black/40'"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

        <!-- USER LIST, GROUPED BY ROLE -->
        <div
          class="users-scroll space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"
          @scroll="closeMenu"
        >
          <p v-if="usersError" class="rounded-xl bg-red-600/20 p-3 text-sm text-red-400">
            Couldn't load the accounts: {{ usersError }}
          </p>
          <p v-else-if="loading && !users.length" class="py-6 text-center text-sm text-zinc-500">
            Loading accounts...
          </p>
          <p v-else-if="!visibleGroups.length" class="py-6 text-center text-sm text-zinc-500">
            No accounts found.
          </p>

          <section v-for="group in visibleGroups" :key="group.key">
            <div class="mb-2 flex items-center gap-2 px-1">
              <h3 class="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                {{ group.label }}
              </h3>
              <span class="text-[11px] font-semibold text-zinc-600">{{ group.users.length }}</span>
              <div class="h-px flex-1 bg-white/5"></div>
            </div>

            <div class="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-black/40">
              <div
                v-for="user in group.users"
                :key="user.id"
                class="user-row transition hover:bg-white/[0.03]"
                :class="menu?.user.id === user.id ? 'bg-white/[0.03]' : ''"
              >
                <!-- AVATAR -->
                <div
                  class="cell-avatar grid h-9 w-9 place-items-center rounded-full text-xs font-bold ring-1"
                  :class="[roleTone(user.role), user.is_active === false ? 'opacity-40' : '']"
                >
                  {{ initials(user) }}
                </div>

                <!-- NAME / EMAIL -->
                <div class="cell-name min-w-0" :class="user.is_active === false ? 'opacity-60' : ''">
                  <div class="flex min-w-0 items-baseline gap-2">
                    <p class="truncate text-sm font-semibold text-white">
                      {{ user.full_name }}
                    </p>
                    <!-- phones: under the name instead, so the name isn't cut off -->
                    <span class="desktop-only shrink-0 font-mono text-[10px] text-zinc-600">
                      #{{ user.account_no }}
                    </span>
                  </div>
                  <p class="truncate text-xs text-zinc-400">
                    {{ user.email }}<span class="phone-only font-mono text-zinc-600"> · #{{ user.account_no }}</span>
                  </p>
                </div>

                <!-- ROLE -->
                <div class="cell-role">
                  <span
                    v-if="user.role === 'admin'"
                    class="inline-flex rounded-md px-2 py-1 text-[11px] font-bold ring-1"
                    :class="roleTone('admin')"
                  >
                    Owner
                  </span>

                  <!-- role change asks for your password -->
                  <select
                    v-else
                    :value="user.role"
                    class="role-select"
                    title="Change role"
                    @change="onRoleChange(user, $event)"
                  >
                    <option value="staff">Staff</option>
                    <option value="cashier">Cashier</option>
                    <option value="supplier">Supplier</option>
                  </select>
                </div>

                <!-- STATUS -->
                <div class="cell-status flex items-center gap-1.5 text-xs font-medium">
                  <span
                    class="h-1.5 w-1.5 rounded-full"
                    :class="user.is_active === false ? 'bg-zinc-500' : 'bg-emerald-400'"
                  ></span>
                  <span :class="user.is_active === false ? 'text-zinc-500' : 'text-zinc-300'">
                    {{ user.is_active === false ? 'Disabled' : 'Active' }}
                  </span>
                </div>

                <!-- ACTIONS -->
                <button
                  class="cell-actions grid h-8 w-8 place-items-center rounded-lg text-lg leading-none text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
                  :class="menu?.user.id === user.id ? 'bg-zinc-800 text-white' : ''"
                  aria-label="Account actions"
                  :aria-expanded="menu?.user.id === user.id"
                  @click.stop="toggleMenu(user, $event)"
                >
                  ⋯
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- ACTIONS MENU (teleported so the scroll area can't clip it) -->
    <Teleport to="body">
      <template v-if="menu">
        <div class="fixed inset-0 z-40" @click="closeMenu" @contextmenu.prevent="closeMenu"></div>

        <div
          class="fixed z-50 w-48 rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl shadow-black/60"
          :style="{ top: `${menu.top}px`, right: `${menu.right}px` }"
          role="menu"
        >
          <!-- users can't rename themselves; only the owner can, here -->
          <button class="menu-item" role="menuitem" @click="runMenu('rename')">
            Rename
          </button>

          <template v-if="menu.user.role === 'admin'">
            <button class="menu-item" role="menuitem" @click="runMenu('own-password')">
              Change my password
            </button>
          </template>

          <template v-else>
            <button class="menu-item" role="menuitem" @click="runMenu('reset')">
              Reset password
            </button>

            <div class="my-1 h-px bg-white/5"></div>

            <button
              class="menu-item"
              :class="menu.user.is_active
                ? 'text-red-400 hover:!bg-red-500/10'
                : 'text-emerald-400 hover:!bg-emerald-500/10'"
              role="menuitem"
              @click="runMenu('toggle')"
            >
              {{ menu.user.is_active ? 'Disable account' : 'Enable account' }}
            </button>
          </template>
        </div>
      </template>
    </Teleport>

    <!-- PASSWORD CONFIRMATION -->
    <AdminPasswordPrompt
      v-if="prompt"
      :title="prompt.title"
      :message="prompt.message"
      :confirm-label="prompt.confirmLabel"
      :text-label="prompt.textLabel"
      :text-value="prompt.textValue"
      :error="promptError"
      :busy="promptBusy"
      @confirm="confirmPrompt"
      @cancel="cancelPrompt"
    />

    <!-- OWNER CHANGES HIS OWN PASSWORD -->
    <ChangeOwnPasswordModal v-if="showOwnPassword" @close="showOwnPassword = false" />

    <!-- ONE-TIME NEW TEMPORARY PASSWORD -->
    <TempPasswordReveal
      v-if="reveal"
      :email="reveal.email"
      :password="reveal.password"
      :expires-at="reveal.expiresAt"
      @close="reveal = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { supabase } from '../../lib/supabase'
import { adminAction } from '../../lib/employeeAdmin'
import CreateEmployeeForm from '../../components/CreateEmployeeForm.vue'
import AdminPasswordPrompt from '../../components/AdminPasswordPrompt.vue'
import TempPasswordReveal from '../../components/TempPasswordReveal.vue'
import ChangeOwnPasswordModal from '../../components/ChangeOwnPasswordModal.vue'

const showOwnPassword = ref(false)

// phones: the "Add employee" form opens from a button
const showCreateForm = ref(false)

const users = ref([])
const userSearch = ref('')
const loading = ref(false)
const usersError = ref('')

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase()
  if (!q) return users.value

  return users.value.filter((user) => {
    const accountNo = (user.account_no || '').toLowerCase()
    const name = (user.full_name || '').toLowerCase()
    const email = (user.email || '').toLowerCase()

    // "#000000009", "9", and "000000009" all match account_no 000000009
    return (
      accountNo.includes(q) ||
      accountNo.includes(q.replace(/^#/, '')) ||
      name.includes(q) ||
      email.includes(q)
    )
  })
})

// Categories (tabs + grouped sections)
const CATEGORIES = [
  { key: 'admin', label: 'Owner' },
  { key: 'staff', label: 'Staff' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'supplier', label: 'Supplier' },
]
const activeTab = ref('all')

// Groups follow the search box, so search + category work together.
// Disabled accounts get their own category (shown last) instead of staying under their role.
const groups = computed(() => [
  ...CATEGORIES.map((c) => ({
    ...c,
    users: filteredUsers.value.filter((u) => u.role === c.key && u.is_active !== false),
  })),
  {
    key: 'disabled',
    label: 'Disabled',
    users: filteredUsers.value.filter((u) => u.is_active === false),
  },
])

const tabs = computed(() => [
  { key: 'all', label: 'All', count: filteredUsers.value.length },
  ...groups.value.map((g) => ({ key: g.key, label: g.label, count: g.users.length })),
])

const visibleGroups = computed(() =>
  groups.value.filter(
    (g) => g.users.length && (activeTab.value === 'all' || activeTab.value === g.key)
  )
)

// ----- Look helpers -----
const ROLE_TONES = {
  admin: 'bg-red-500/15 text-red-300 ring-red-500/30',
  staff: 'bg-zinc-700/40 text-zinc-200 ring-white/10',
  cashier: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  supplier: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
}

function roleTone(role) {
  return ROLE_TONES[role] || ROLE_TONES.staff
}

function initials(user) {
  const parts = String(user.full_name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return String(user.email || '?')[0].toUpperCase()
}

// ----- Actions menu (⋯) -----
const menu = ref(null) // { user, top, right }

function toggleMenu(user, event) {
  if (menu.value?.user.id === user.id) {
    closeMenu()
    return
  }

  const rect = event.currentTarget.getBoundingClientRect()
  const menuHeight = user.role === 'admin' ? 84 : 132
  const openUp = rect.bottom + menuHeight + 8 > window.innerHeight

  menu.value = {
    user,
    top: openUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
    right: window.innerWidth - rect.right,
    openedAt: Date.now(),
  }
}

// A double click (or a touchpad / phone "ghost" tap) could land its second
// click on an item of the menu that had just opened and start e.g. Reset
// password without anyone choosing it. Items only work after a short moment.
const MENU_READY_MS = 400

function closeMenu() {
  menu.value = null
}

function runMenu(action) {
  if (menu.value && Date.now() - menu.value.openedAt < MENU_READY_MS) return

  const user = menu.value?.user
  closeMenu()
  if (!user) return

  if (action === 'own-password') showOwnPassword.value = true
  else if (action === 'rename') onRename(user)
  else if (action === 'reset') onReset(user)
  else if (action === 'toggle') onToggle(user)
}

function onKeydown(event) {
  if (event.key === 'Escape') closeMenu()
}

// Password confirmation popup state
const prompt = ref(null)        // { title, message, confirmLabel, textLabel?, textValue?, run, onCancel }
const promptError = ref('')
const promptBusy = ref(false)

// One-time reveal of a new temporary password
const reveal = ref(null)        // { email, password, expiresAt }

async function fetchUsers() {
  loading.value = true
  usersError.value = ''

  const { data, error } = await supabase.rpc('admin_list_users')

  loading.value = false

  // a failed load used to look exactly like "No accounts found"
  if (error) {
    usersError.value = error.message
    return
  }

  users.value = data || []
}

function ask(config) {
  promptError.value = ''
  prompt.value = config
}

async function confirmPrompt(adminPassword, text) {
  if (!prompt.value || promptBusy.value) return
  promptBusy.value = true
  promptError.value = ''
  try {
    await prompt.value.run(adminPassword, text)
    prompt.value = null
  } catch (err) {
    promptError.value = err.message
  } finally {
    promptBusy.value = false
  }
}

function cancelPrompt() {
  prompt.value?.onCancel?.()
  prompt.value = null
  promptError.value = ''
}

function onRoleChange(user, event) {
  const select = event.target
  const oldRole = user.role
  const newRole = select.value
  if (newRole === oldRole) return

  ask({
    title: 'Confirm role change',
    message: `Change ${user.full_name} from ${oldRole} to ${newRole}? Enter your password to confirm.`,
    confirmLabel: 'Change role',
    run: async (adminPassword) => {
      await adminAction(supabase, 'set_role', {
        user_id: user.id,
        role: newRole,
        admin_password: adminPassword,
      })
      await fetchUsers()
    },
    // closed without confirming: put the dropdown back
    onCancel: () => { select.value = oldRole },
  })
}

// Only the owner can change names (staff and cashiers can't rename themselves).
function onRename(user) {
  ask({
    title: 'Rename account',
    message: `New name for ${user.email}. Enter your password to confirm.`,
    confirmLabel: 'Rename',
    textLabel: 'Full name',
    textValue: user.full_name || '',
    run: async (adminPassword, newName) => {
      await adminAction(supabase, 'rename', {
        user_id: user.id,
        full_name: newName,
        admin_password: adminPassword,
      })
      await fetchUsers()
    },
  })
}

function onToggle(user) {
  const verb = user.is_active ? 'Disable' : 'Enable'

  ask({
    title: `${verb} account`,
    message: `${verb} ${user.full_name}'s account? Enter your password to confirm.`,
    confirmLabel: verb,
    run: async (adminPassword) => {
      await adminAction(supabase, 'toggle_active', {
        user_id: user.id,
        admin_password: adminPassword,
      })
      await fetchUsers()
    },
  })
}

function onReset(user) {
  ask({
    title: 'Reset password',
    message: `Create a new temporary password for ${user.full_name}? Their current password stops working right away. Enter your password to confirm.`,
    confirmLabel: 'Reset password',
    run: async (adminPassword) => {
      const result = await adminAction(supabase, 'reset_password', {
        user_id: user.id,
        admin_password: adminPassword,
      })
      reveal.value = {
        email: result.email,
        password: result.temp_password,
        expiresAt: result.expires_at,
      }
    },
  })
}

onMounted(() => {
  fetchUsers()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', closeMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', closeMenu)
})
</script>

<style scoped>
.input {
  width: 100%;
  border-radius: 0.875rem;
  background: black;
  padding: 0.65rem 0.95rem;
  font-size: 0.875rem;
  color: white;
  outline: none;
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: border-color 0.15s;
}

.input:focus {
  border-color: rgb(239 68 68 / 0.6);
}

.input::placeholder {
  color: #71717a;
}

.users-scroll {
  scrollbar-width: thin;
  scrollbar-color: #3f3f46 transparent;
}

/* One compact row: avatar | name/email | role | status | ⋯ */
.user-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 116px 80px 32px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
}

/* Small screens, two lines:
     avatar | name / email            | ⋯
            | role       | status     |
   (Before, role and status each took a line of their own.) */
@media (max-width: 640px) {
  .user-row {
    grid-template-columns: 36px minmax(0, 1fr) auto 32px;
    row-gap: 0.5rem;
  }

  .cell-avatar  { grid-column: 1;     grid-row: 1; }
  .cell-name    { grid-column: 2 / 4; grid-row: 1; }
  .cell-actions { grid-column: 4;     grid-row: 1; }
  .cell-role    { grid-column: 2;     grid-row: 2; }
  .cell-status  { grid-column: 3;     grid-row: 2; }
}

.role-select {
  width: 100%;
  appearance: none;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgb(39 39 42 / 0.6)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath stroke='%23a1a1aa' stroke-width='1.5' d='m1 1 4 4 4-4'/%3E%3C/svg%3E")
    no-repeat right 0.6rem center;
  padding: 0.35rem 1.6rem 0.35rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(228 228 231);
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}

.role-select:hover {
  background-color: rgb(63 63 70 / 0.6);
}

.role-select:focus {
  border-color: rgb(239 68 68 / 0.6);
}

.menu-item {
  display: block;
  width: 100%;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(228 228 231);
  transition: background-color 0.12s;
}

.menu-item:hover {
  background: rgb(255 255 255 / 0.06);
}
</style>