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
    <div class="grid items-start gap-5 lg:grid-cols-[320px_1fr]">

      <!-- ADD USER -->
      <div class="card p-5">
        <h2 class="mb-5 text-2xl font-extrabold text-white">
          Add User
        </h2>

        <div class="space-y-4">

          <!-- FULL NAME -->
          <input
            v-model="newUser.full_name"
            type="text"
            placeholder="Full name"
            class="input"
          />

          <!-- EMAIL -->
          <input
            v-model="newUser.email"
            type="email"
            placeholder="Email address"
            class="input"
          />

          <!-- PASSWORD -->
          <input
            v-model="newUser.password"
            type="password"
            placeholder="Password"
            class="input"
          />

          <!-- ROLE -->
          <select
            v-model="newUser.role"
            class="input"
          >
            <option value="staff">Staff</option>
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
             <option value="supplier">Supplier</option>
          </select>

          <!-- ERROR -->
          <p
            v-if="errorMessage"
            class="rounded-xl bg-red-600/20 p-3 text-sm text-red-400"
          >
            {{ errorMessage }}
          </p>

          <!-- SUCCESS -->
          <p
            v-if="successMessage"
            class="rounded-xl bg-green-600/20 p-3 text-sm text-green-400"
          >
            {{ successMessage }}
          </p>

          <!-- BUTTON -->
          <button
            @click="createUser"
            class="w-full rounded-2xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700"
          >
            Create User
          </button>
        </div>
      </div>

      <!-- USERS -->
      <div class="card p-5">

        <!-- TOP -->
        <div class="mb-5 flex items-center justify-between gap-4">
          <h2 class="text-2xl font-extrabold text-white">
            User Accounts
          </h2>

          <button
            @click="fetchUsers"
            class="rounded-2xl bg-zinc-800 px-5 py-3 font-bold text-white transition hover:bg-zinc-700"
          >
            Refresh
          </button>
        </div>

        <!-- SEARCH -->
        <div class="mb-5">
          <input
            v-model="userSearch"
            type="text"
            placeholder="Search by account number, name, or email..."
            class="input w-full"
          />
          <p v-if="userSearch" class="mt-2 text-xs text-zinc-500">
            {{ filteredUsers.length }} of {{ users.length }} accounts
          </p>
        </div>

        <!-- USER LIST -->
        <div class="space-y-5">

          <p v-if="!filteredUsers.length" class="py-6 text-center text-zinc-500">
            No accounts match "{{ userSearch }}".
          </p>

          <div
            v-for="user in filteredUsers"
            :key="user.id"
            class="flex items-center justify-between rounded-[24px] bg-black p-5"
          >

            <!-- LEFT -->
            <div>
              <p class="font-mono text-xs tracking-wider text-zinc-500">
                #{{ user.account_no }}
              </p>

              <h3 class="text-2xl font-extrabold text-white">
                {{ user.full_name }}
              </h3>

              <p class="mt-1 text-zinc-400">
                {{ user.email }}
              </p>

              <p class="mt-2 capitalize text-red-400">
                {{ user.role }}
              </p>

              <p
                class="mt-2 font-bold"
                :class="user.is_active ? 'text-emerald-400' : 'text-red-400'"
              >
                {{ user.is_active ? 'Active' : 'Disabled' }}
              </p>
            </div>

            <!-- RIGHT -->
            <div class="flex items-center gap-3">

              <!-- ROLE -->
              <select
                v-model="user.role"
                @change="updateRole(user)"
                class="rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none"
              >
                <option value="staff">Staff</option>
                <option value="cashier">Cashier</option>
                <option value="admin">Admin</option>
                <option value="supplier">Supplier</option>
              </select>

              <!-- ENABLE / DISABLE -->
              <button
                @click="toggleUser(user)"
                class="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700"
              >
                {{ user.is_active ? 'Disable' : 'Enable' }}
              </button>
            </div>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../../lib/supabase'

const users = ref([])
const userSearch = ref('')

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

const loading = ref(false)

const errorMessage = ref('')
const successMessage = ref('')

const newUser = ref({
  full_name: '',
  email: '',
  password: '',
  role: 'staff',
})

async function fetchUsers() {
  const { data, error } = await supabase.rpc('admin_list_users')

  if (error) {
    console.log(error)
    return
  }

  users.value = data
}

async function createUser() {
  if (loading.value) return

  errorMessage.value = ''
  successMessage.value = ''
  loading.value = true

  try {
    // CREATE AUTH USER
    const { data: authData, error: authError } =
      await supabase.auth.signUp({
        email: newUser.value.email,
        password: newUser.value.password,
      })

    if (authError) {
      errorMessage.value = authError.message
      loading.value = false
      return
    }

    const authUser = authData.user

    if (!authUser) {
      errorMessage.value = 'Auth user was not created.'
      loading.value = false
      return
    }

    // INSERT PROFILE
    const { error: profileError } = await supabase.rpc('admin_create_profile', {
      p_id: authUser.id,
      p_full_name: newUser.value.full_name,
      p_email: newUser.value.email,
      p_role: newUser.value.role,
    })

    if (profileError) {
      errorMessage.value = profileError.message
      loading.value = false
      return
    }

    successMessage.value = 'User created successfully.'

    // RESET FORM
    newUser.value = {
      full_name: '',
      email: '',
      password: '',
      role: 'staff',
    }

    fetchUsers()
  } catch (err) {
    errorMessage.value = err.message
  }

  loading.value = false
}

async function updateRole(user) {
  await supabase.rpc('admin_update_user_role', {
    p_user_id: user.id,
    p_role: user.role,
  })
}

async function toggleUser(user) {
  await supabase.rpc('admin_toggle_user_active', {
    p_user_id: user.id,
  })

  fetchUsers()
}

onMounted(() => {
  fetchUsers()
})
</script>

<style scoped>
.input {
  width: 100%;
  border-radius: 18px;
  background: black;
  padding: 14px 18px;
  color: white;
  outline: none;
  border: 1px solid rgba(255,255,255,0.05);
}

.input::placeholder {
  color: #71717a;
}
</style>