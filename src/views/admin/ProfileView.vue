<template>
  <div>
    <!-- HEADER -->
    <div class="mb-5 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
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
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
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
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">

        <!-- TOP -->
        <div class="mb-5 flex items-center justify-between">
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

        <!-- USER LIST -->
        <div class="space-y-5">

          <div
            v-for="user in users"
            :key="user.id"
            class="flex items-center justify-between rounded-[24px] bg-black p-5"
          >

            <!-- LEFT -->
            <div>
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
import { ref, onMounted } from 'vue'
import { supabase } from '../../lib/supabase'

const users = ref([])

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
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

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
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authUser.id,
        full_name: newUser.value.full_name,
        email: newUser.value.email,
        role: newUser.value.role,
        is_active: true,
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
  await supabase
    .from('profiles')
    .update({
      role: user.role,
    })
    .eq('id', user.id)
}

async function toggleUser(user) {
  await supabase
    .from('profiles')
    .update({
      is_active: !user.is_active,
    })
    .eq('id', user.id)

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