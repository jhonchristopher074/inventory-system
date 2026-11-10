<template>
  <!-- Computers: exactly the height of the screen (100dvh minus the page's
       padding, and the bell + name row when it has one: --topbar-space), so the page
       itself never scrolls; the account list scrolls inside its card, and
       the Add employee form inside its own if the screen is short. Below
       460px of height it scrolls like any page. Phones: one column that
       scrolls. -->
  <div class="lg:flex lg:h-[calc(100dvh-3.85rem-var(--topbar-space,0px))] lg:min-h-[460px] lg:flex-col">
    <PageHeader
      title="Profile & Users"
    >
      <!-- the Owner's two-step verification (6-digit code at login) -->
      <TwoStepButton v-if="isOwner" />
    </PageHeader>

    <!-- MAIN -->
    <!-- minmax(0, …): a column may shrink to the screen; otherwise the
         swipeable tab row widened the whole page on phones.
         Computers: both columns end at the same line (the user list is as
         tall as the logo + Add employee column and scrolls inside). -->
    <div class="grid grid-cols-1 items-start gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">

      <!-- ADD USER: the server generates a one-time temporary password.
           Phones: behind a button, so the user list isn't pushed down. -->
      <div class="lg:flex lg:min-h-0 lg:flex-col">
        <!-- a Manager: who he is, and his password -->
        <template v-if="!isOwner">
          <section class="card mb-4 shrink-0 overflow-hidden">
            <div class="me-head">
              <span class="me-avatar" aria-hidden="true">{{ initials(me) }}</span>
              <div class="min-w-0">
                <p class="truncate text-lg font-extrabold text-white">{{ me.full_name || 'You' }}</p>
                <p class="truncate text-xs text-zinc-400">{{ me.email }}</p>
                <span class="mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold ring-1" :class="roleTone(me.role)">
                  {{ ROLE_LABELS[me.role] || me.role }}
                </span>
              </div>
            </div>
            <div class="border-t border-white/5 p-4">
              <button
                type="button"
                class="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/15"
                @click="showOwnPassword = true"
              >
                <NavIcon name="key" class="h-4 w-4" /> Change my password
              </button>
            </div>
          </section>

        </template>

        <!-- the store's logo: change it (crop, then your password) -->
        <!-- the store: its logo, and (the Owner) the backup, one card -->
        <div class="card mb-4 shrink-0 divide-y divide-white/10 !p-0">
          <StoreLogoCard flat />
          <!-- Backup: hidden for now (to come back as a JSON download).
               The code stays: components/BackupCard.vue, lib/backup.js -->
        </div>

        <button
          v-if="isOwner"
          type="button"
          class="phone-only w-full rounded-2xl bg-red-600 py-3 font-bold text-white hover:bg-red-700"
          :aria-expanded="showCreateForm"
          @click="showCreateForm = !showCreateForm"
        >
          {{ showCreateForm ? '✕ Close' : '+ Add employee' }}
        </button>

        <!-- hidden with CSS, not v-if: the new temporary password popup
             belongs to this form and must stay open after "Create account" -->
        <div
          v-if="isOwner"
          class="employee-form lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
          :class="showCreateForm ? 'mt-3' : 'desktop-only'"
        >
          <CreateEmployeeForm @created="fetchUsers" />
        </div>
      </div>

      <!-- USERS: on computers as tall as the screen allows; the list
           scrolls inside -->
      <div class="card flex min-w-0 flex-col p-5 lg:min-h-0">

        <!-- TOP -->
        <div class="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-extrabold text-white">User Accounts</h2>
            <p class="text-xs text-zinc-500">
              {{ allAccounts }} accounts
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
          <div class="flex gap-2">
            <input
              maxlength="80"
              v-model="userSearch"
              type="text"
              placeholder="Search by account number, name, or email..."
              class="input min-w-0 flex-1"
            />
            <span id="accounts-rows" class="contents"></span>
          </div>
          <p v-if="userSearch.trim()" class="mt-1.5 text-xs text-zinc-500">
            {{ accountCount }} matching
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

        <!-- THE ACCOUNTS: a table, one page at a time (25, 50 or 100) -->
        <div
          class="users-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"
          @scroll="closeMenu"
        >
          <p v-if="usersError" class="rounded-xl bg-red-600/20 p-3 text-sm text-red-400">
            Couldn't load the accounts: {{ usersError }}
          </p>
          <p v-else-if="loading && !users.length" class="py-6 text-center text-sm text-zinc-500">
            Loading accounts...
          </p>
          <p v-else-if="!users.length" class="py-6 text-center text-sm text-zinc-500">
            No accounts found.
          </p>

          <div
            v-else
            class="overflow-hidden rounded-2xl border border-white/5 bg-black/40 transition-opacity"
            :class="{ 'opacity-60': loading }"
          >
            <!-- column titles (computers) -->
            <div class="user-row user-head desktop-only" aria-hidden="true">
              <span></span>
              <span>Name</span>
              <span>Role</span>
              <span>Status</span>
              <span></span>
            </div>

            <div class="divide-y divide-white/5">
              <div
                v-for="user in users"
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
                    v-if="user.role === 'admin' || !isOwner"
                    class="inline-flex rounded-md px-2 py-1 text-[11px] font-bold ring-1"
                    :class="roleTone(user.role)"
                  >
                    {{ ROLE_LABELS[user.role] || user.role }}
                  </span>

                  <!-- role change asks for your password -->
                  <select
                    v-else
                    :value="user.role"
                    class="role-select"
                    title="Change role"
                    @change="onRoleChange(user, $event)"
                  >
                    <option value="manager">Manager</option>
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
                <span v-if="!canMenu(user)" class="cell-actions h-8 w-8" aria-hidden="true"></span>
                <button
                  v-else
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
          </div>
        </div>

        <TablePager
          v-if="!usersError && total > 0"
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :sizes="PAGE_SIZES"
          noun="accounts"
          rows-to="#accounts-rows"
          class="-mx-5 -mb-5 mt-3 shrink-0"
        />
      </div>
    </div>

    <!-- ACTIONS MENU (teleported so the scroll area can't clip it) -->
    <Teleport to="body">
      <template v-if="menu">
        <div class="fixed inset-0 z-40" @click="closeMenu" @contextmenu.prevent="closeMenu"></div>

        <div
          class="fixed z-50 w-48 rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl shadow-black/60"
          :style="menu.openUp
            ? { bottom: `${menu.bottom}px`, right: `${menu.right}px` }
            : { top: `${menu.top}px`, right: `${menu.right}px` }"
          role="menu"
        >
          <!-- a Manager: his own password, or disable / enable -->
          <template v-if="!isOwner">
            <button v-if="menu.user.id === me.id" class="menu-item" role="menuitem" @click="runMenu('own-password')">
              Change my password
            </button>
            <button
              v-else
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

          <template v-else>
          <!-- users can't rename themselves; only the owner can, here -->
          <button class="menu-item" role="menuitem" @click="runMenu('rename')">
            Rename
          </button>

          <button class="menu-item" role="menuitem" @click="runMenu('email')">
            Change email
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
      :text-type="prompt.textType"
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import PageHeader from '../../components/PageHeader.vue'
import { ROLE_LABELS } from '../../lib/roles'
import { currentUser } from '../../lib/currentUser'
import { supabase } from '../../lib/supabase'
import { adminAction } from '../../lib/employeeAdmin'
import CreateEmployeeForm from '../../components/CreateEmployeeForm.vue'
import AdminPasswordPrompt from '../../components/AdminPasswordPrompt.vue'
import TempPasswordReveal from '../../components/TempPasswordReveal.vue'
import ChangeOwnPasswordModal from '../../components/ChangeOwnPasswordModal.vue'
import StoreLogoCard from '../../components/StoreLogoCard.vue'
import TwoStepButton from '../../components/TwoStepButton.vue'
import NavIcon from '../../components/NavIcon.vue'
import TablePager from '../../components/TablePager.vue'

const showOwnPassword = ref(false)

// the Owner manages every account; a Manager sees them, and can only
// disable / enable staff, cashier and supplier accounts (and change his
// own password). The server checks the same (admin-action).
const me = computed(() => currentUser.value || {})
const isOwner = computed(() => me.value.role === 'admin')

function canMenu(user) {
  if (isOwner.value) return true
  if (user.id === me.value.id) return true
  return ['staff', 'cashier', 'supplier'].includes(user.role)
}

// phones: the "Add employee" form opens from a button
const showCreateForm = ref(false)

// The accounts, one page at a time (supabase/migrations/20261119000001:
// list_accounts_page searches and filters in the database, so thousands of
// accounts stay fast). Before that SQL is run: every account is loaded
// (admin_list_users) and the same is done here.
const PAGE_SIZES = [25, 50, 100]
const users = ref([]) // this page
const total = ref(0) // in this tab, after the search
const counts = ref({}) // per tab, after the search
const userSearch = ref('')
const loading = ref(false)
const usersError = ref('')
const page = ref(1)
const pageSize = ref(PAGE_SIZES[0])
const serverPages = ref(true)
const everyone = ref([]) // only before the SQL is run

// Tabs: All (accounts in use), each role, then Disabled
const CATEGORIES = ['admin', 'manager', 'staff', 'cashier', 'supplier'].map((key) => ({
  key,
  label: ROLE_LABELS[key], // the 'admin' role is the Owner (lib/roles.js)
}))
const activeTab = ref('all')

const tabs = computed(() => [
  { key: 'all', label: 'All', count: counts.value.all || 0 },
  ...CATEGORIES.map((c) => ({ ...c, count: counts.value[c.key] || 0 })),
  { key: 'disabled', label: 'Disabled', count: counts.value.disabled || 0 },
])

// every account (in use and disabled) that matches the search
const accountCount = computed(() => (counts.value.all || 0) + (counts.value.disabled || 0))

// every account, whatever is searched (the header's number)
const allAccounts = ref(0)
watch(counts, () => {
  if (!userSearch.value.trim()) allAccounts.value = accountCount.value
})

const ROLE_ORDER = { admin: 0, manager: 1, staff: 2, cashier: 3, supplier: 4 }

// before the SQL: the same search, tabs and pages, here
function pageHere() {
  const q = userSearch.value.trim().toLowerCase()
  const number = q.replace(/^#/, '')
  const matched = everyone.value.filter((user) => {
    if (!q) return true
    // "#000000009", "9", and "000000009" all match account_no 000000009
    return (
      String(user.account_no || '').includes(number) ||
      String(user.full_name || '').toLowerCase().includes(q) ||
      String(user.email || '').toLowerCase().includes(q)
    )
  })
  const inUse = matched.filter((u) => u.is_active !== false)
  counts.value = {
    all: inUse.length,
    ...Object.fromEntries(CATEGORIES.map((c) => [c.key, inUse.filter((u) => u.role === c.key).length])),
    disabled: matched.length - inUse.length,
  }
  const tab = activeTab.value
  const rows = matched
    .filter((u) => (tab === 'all' ? u.is_active !== false : tab === 'disabled' ? u.is_active === false : u.role === tab && u.is_active !== false))
    .sort((a, b) =>
      (ROLE_ORDER[a.role] ?? 5) - (ROLE_ORDER[b.role] ?? 5) ||
      String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || ''))
    )
  total.value = rows.length
  users.value = rows.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
}

let loadTurn = 0

async function fetchUsers() {
  const turn = ++loadTurn
  loading.value = true
  usersError.value = ''

  if (serverPages.value) {
    const { data, error } = await supabase.rpc('list_accounts_page', {
      p_search: userSearch.value.trim(),
      p_tab: activeTab.value,
      p_limit: pageSize.value,
      p_offset: (page.value - 1) * pageSize.value,
    })
    if (turn !== loadTurn) return // a newer search or page is on its way
    if (!error && data) {
      users.value = data.rows || []
      total.value = Number(data.total) || 0
      counts.value = data.counts || {}
      loading.value = false
      // the last page emptied (e.g. an account was disabled): one page back
      if (users.value.length === 0 && page.value > 1) {
        page.value -= 1
      }
      return
    }
    // the SQL isn't run yet: load every account and page them here
    if (error && !/list_accounts_page|schema cache|function/i.test(error.message)) {
      loading.value = false
      usersError.value = error.message
      return
    }
    serverPages.value = false
  }

  const { data, error } = await supabase.rpc('admin_list_users')
  if (turn !== loadTurn) return
  loading.value = false
  // a failed load used to look exactly like "No accounts found"
  if (error) {
    usersError.value = error.message
    return
  }
  everyone.value = data || []
  pageHere()
}

// typing: wait a moment, then search from page 1
let searchTimer = null
watch(userSearch, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    if (serverPages.value) fetchUsers()
    else pageHere()
  }, 300)
})

watch(activeTab, () => {
  if (page.value !== 1) page.value = 1 // the page watcher loads
  else if (serverPages.value) fetchUsers()
  else pageHere()
})

watch([page, pageSize], ([, size], [, oldSize]) => {
  if (size !== oldSize && page.value !== 1) {
    page.value = 1
    return
  }
  if (serverPages.value) fetchUsers()
  else pageHere()
})

onBeforeUnmount(() => clearTimeout(searchTimer))

// ----- Look helpers -----
// each role's colour, as on its dashboard and in the top bar
// (ROLE_TONES in lib/roles.js): Owner red, Staff violet, Cashier green,
// Supplier blue
const ROLE_TONES = {
  admin: 'bg-red-500/15 text-red-300 ring-red-500/30',
  staff: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  cashier: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  manager: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
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
  // the Owner's menu is the tallest; a Manager's has one item
  const menuHeight = !isOwner.value ? 48 : user.role === 'admin' ? 120 : 168
  const openUp = rect.bottom + menuHeight + 8 > window.innerHeight

  // opening up: pin the menu's bottom to the button, so it sits right
  // above it whatever its real height
  menu.value = {
    user,
    openUp,
    top: rect.bottom + 6,
    bottom: window.innerHeight - rect.top + 6,
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
  else if (action === 'email') onChangeEmail(user)
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

// Not while the action is running: it would still finish on the server,
// with the window gone (and its result landing on the next window).
function cancelPrompt() {
  if (promptBusy.value) return

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

// Only the owner can change emails. The new email is their login from now
// on (the old one stops working); the password stays the same.
function onChangeEmail(user) {
  ask({
    title: 'Change email',
    message: `New email for ${user.full_name}. They log in with it from now on (same password). Enter your password to confirm.`,
    confirmLabel: 'Change email',
    textLabel: 'New email',
    textValue: user.email || '',
    textType: 'email',
    run: async (adminPassword, newEmail) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        throw new Error('Enter a valid email address.')
      }

      await adminAction(supabase, 'change_email', {
        user_id: user.id,
        email: newEmail,
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
/* a Manager's own card */
.me-head {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1.1rem 1.1rem 1rem;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), transparent 70%);
}

.me-avatar {
  display: grid;
  flex: none;
  width: 3.2rem;
  height: 3.2rem;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(135deg, #fcd34d, #b45309);
  font-size: 1.05rem;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
}

.perm-dot {
  display: grid;
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  place-items: center;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
}

/* computers: the Add employee card reaches the bottom, level with the
   accounts card beside it */
@media (min-width: 1024px) {
  .employee-form :deep(.ce-form) {
    min-height: 100%;
  }
}

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
/* the column titles of the accounts table */
.user-head {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

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