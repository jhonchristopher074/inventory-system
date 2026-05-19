<template>
  <RouterView v-if="$route.path === '/login'" />

  <div v-else class="min-h-screen bg-black text-white app-scale">
    <div class="grid min-h-screen grid-cols-[270px_1fr]">
      <aside class="sticky top-0 h-screen border-r border-white/5 bg-gradient-to-b from-[#1b0909] to-[#0c0c0c] p-5">
        <div class="mb-6 rounded-3xl border border-white/10 bg-gradient-to-br from-red-500/20 to-white/5 p-4">
          <h1 class="text-3xl font-extrabold text-red-500 leading-tight">10 FIVE 7</h1>
          <p class="text-sm font-semibold text-white">  HARDWARE </p>
          <p class="mt-1 text-sm text-zinc-400">Inventory Management System</p>
        </div>

        <!-- ADMIN -->
        <nav v-if="role === 'admin'" class="flex flex-col gap-2">
          <RouterLink to="/" class="nav-link" active-class="active-link">Dashboard</RouterLink>
          <RouterLink to="/inventory" class="nav-link" active-class="active-link">Inventory</RouterLink>
          <RouterLink to="/admin/pos" class="nav-link" active-class="active-link">POS</RouterLink>
          <RouterLink to="/admin/sales" class="nav-link" active-class="active-link">Sales History</RouterLink>
          <RouterLink to="/calendar" class="nav-link" active-class="active-link">Calendar</RouterLink>
          <RouterLink to="/approval" class="nav-link" active-class="active-link">Approval</RouterLink>
          <RouterLink to="/documentation" class="nav-link" active-class="active-link">Documentation</RouterLink>
          <RouterLink to="/archived" class="nav-link" active-class="active-link">Archived</RouterLink>
          <RouterLink to="/profile" class="nav-link" active-class="active-link">Profile</RouterLink>

          <button @click="logout" class="logout-btn">Logout</button>
        </nav>

        <!-- CASHIER -->
        <nav v-else-if="role === 'cashier'" class="flex flex-col gap-2">
          <RouterLink to="/cashier" class="nav-link" active-class="active-link">Dashboard</RouterLink>
          <RouterLink to="/cashier/pos" class="nav-link" active-class="active-link">POS</RouterLink>
          <RouterLink to="/cashier/sales" class="nav-link" active-class="active-link">Sales History</RouterLink>
          <RouterLink to="/cashier/profile" class="nav-link" active-class="active-link">Profile</RouterLink>

          <button @click="logout" class="logout-btn">Logout</button>
        </nav>

        <!-- STAFF -->
        <nav v-else class="flex flex-col gap-2">
          <RouterLink to="/staff" class="nav-link" active-class="active-link">Dashboard</RouterLink>
          <RouterLink to="/staff/inventory" class="nav-link" active-class="active-link">Inventory</RouterLink>
          <RouterLink to="/staff/calendar" class="nav-link" active-class="active-link">Inspection Calendar</RouterLink>
          <RouterLink to="/staff/documentation" class="nav-link" active-class="active-link">Documentation</RouterLink>
          <RouterLink to="/staff/profile" class="nav-link" active-class="active-link">Profile</RouterLink>

          <button @click="logout" class="logout-btn">Logout</button>
        </nav>
      </aside>

      <main class="bg-black p-7">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <p class="text-sm text-zinc-500">Logged in as</p>
            <p class="font-bold capitalize text-red-400">{{ role }}</p>
          </div>

          <NotificationBell />
        </div>

        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from './lib/supabase'
import NotificationBell from './components/NotificationBell.vue'
import { RouterLink } from 'vue-router'

const router = useRouter()
const route = useRoute()

const role = ref('staff')

async function getUserRole() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user

  if (!user) {
    role.value = 'staff'
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('ROLE ERROR:', error)
    role.value = 'staff'
    return
  }

  role.value = data?.role || 'staff'
}

async function logout() {
  await supabase.auth.signOut()
  role.value = 'staff'
  router.push('/login')
}

onMounted(getUserRole)

watch(
  () => route.path,
  () => {
    getUserRole()
  }
)
</script>

<style>
.nav-link {
  display: block;
  border-radius: 1rem;
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: rgb(212 212 216);
  transition: 0.2s;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.active-link {
  background: rgb(220 38 38);
  color: white;
}

.logout-btn {
  margin-top: 1.5rem;
  border-radius: 1rem;
  background: rgb(220 38 38);
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 700;
  color: white;
  transition: 0.2s;
}

.logout-btn:hover {
  background: rgb(185 28 28);
}



</style>