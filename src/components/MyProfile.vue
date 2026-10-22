<script setup>
// Profile shared by the staff and cashier pages: account details
// (read-only — only the administrator can change a name or email) and
// password change. Role-specific numbers go in the "stats" slot.
import { onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import ChangeOwnPasswordModal from './ChangeOwnPasswordModal.vue'

defineProps({
  roleLabel: { type: String, default: 'ACCOUNT' },
})

const profile = ref({
  full_name: '',
  email: '',
  role: '',
  is_active: true,
})

const showOwnPassword = ref(false)

const errorMessage = ref('')

async function fetchProfile() {
  const { data, error } = await supabase.rpc('get_my_profile')

  if (error) {
    errorMessage.value = error.message
    return
  }

  if (data) profile.value = data
}

onMounted(fetchProfile)
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[350px_1fr]">
    <!-- PROFILE CARD -->
    <div class="card p-6">
      <div class="flex flex-col items-center">
        <h2 class="text-center text-3xl font-black text-white">
          {{ profile.full_name || 'No name' }}
        </h2>

        <p class="mt-1 break-all text-center text-zinc-400">
          {{ profile.email }}
        </p>

        <div class="mt-4 rounded-full bg-red-950 px-4 py-2 text-sm font-bold text-red-400">
          {{ roleLabel }}
        </div>
      </div>

      <!-- role-specific numbers, e.g. the staff documentation counts -->
      <div v-if="$slots.stats" class="mt-8 space-y-4">
        <slot name="stats" />
      </div>
    </div>

    <!-- ACCOUNT INFORMATION -->
    <div class="card p-6">
      <h2 class="text-3xl font-black text-white">
        Account Information
      </h2>

      <p class="mt-1 text-sm text-zinc-500">
        Your name and email can only be changed by the administrator.
      </p>

      <div class="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <p class="field-label">Full Name</p>
          <p class="field-value">{{ profile.full_name || '—' }}</p>
        </div>

        <div>
          <p class="field-label">Email</p>
          <p class="field-value break-all">{{ profile.email || '—' }}</p>
        </div>

        <div>
          <p class="field-label">Role</p>
          <p class="field-value uppercase">{{ profile.role || '—' }}</p>
        </div>

        <div>
          <p class="field-label">Status</p>
          <p
            class="field-value font-bold"
            :class="profile.is_active === false ? 'text-red-400' : 'text-emerald-400'"
          >
            {{ profile.is_active === false ? 'Disabled' : 'Active' }}
          </p>
        </div>
      </div>

      <div v-if="errorMessage" class="mt-5 rounded-2xl bg-red-600/20 p-4 text-red-400">
        {{ errorMessage }}
      </div>

      <!-- PASSWORD -->
      <div class="mt-6 rounded-2xl bg-black p-5">
        <h3 class="text-xl font-bold text-white">Password</h3>

        <p class="mt-1 text-sm text-zinc-400">
          You'll be asked for your current password first.
        </p>

        <button
          class="mt-4 rounded-xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700"
          @click="showOwnPassword = true"
        >
          Change Password
        </button>
      </div>
    </div>

    <ChangeOwnPasswordModal v-if="showOwnPassword" @close="showOwnPassword = false" />
  </div>
</template>

<style scoped>
.field-label {
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: rgb(212 212 216);
}

.field-value {
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgb(9 9 11);
  padding: 1rem;
  color: rgb(212 212 216);
}
</style>
