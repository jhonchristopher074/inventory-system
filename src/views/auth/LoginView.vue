<template>
  <div class="flex min-h-screen items-center justify-center bg-black px-4 text-white">
    <div class="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-8 shadow-2xl">
      <div>
        <h1 class="text-3xl font-extrabold text-red-500">10 FIVE 7</h1>
        <h1 class="text-lg font-bold tracking-wide text-white">HARDWARE</h1>
      </div>

      <p class="mt-2 text-zinc-400">
        Login to Inventory Management System
      </p>

      <form @submit.prevent="login" class="mt-8 space-y-4">
        <div>
          <label class="text-sm text-zinc-400">Email</label>

          <input
            v-model="email"
            type="email"
            required
            class="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-red-500"
            placeholder="Enter email"
          />
        </div>

        <div>
          <label class="text-sm text-zinc-400">Password</label>

          <input
            v-model="password"
            type="password"
            required
            class="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-red-500"
            placeholder="Enter password"
          />
        </div>

        <p
          v-if="errorMessage"
          class="rounded-xl bg-red-500/10 p-3 text-sm text-red-400"
        >
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-2xl bg-red-600 py-3 font-bold transition hover:bg-red-700 disabled:opacity-50"
        >
          {{ loading ? 'Logging in...' : 'Login' }}
        </button>

        <button
          type="button"
          class="mt-3 w-full text-sm font-semibold text-zinc-400 hover:text-red-400"
          @click="forgotPassword"
        >
          Forgot password?
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { afterLogin } from '../../lib/passwordStatus'
import { markActivity } from '../../lib/idleLogout'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
// shows e.g. "Your temporary password has expired..." after being sent back here
const errorMessage = ref(route.query.notice ? String(route.query.notice) : '')

async function login() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  })

  if (error) {
    errorMessage.value = error.message
    loading.value = false
    return
  }

  // fresh login: restart the auto-logout clock
  markActivity()

  // Temporary password? Expired -> signed out with a message.
  // Still valid -> go to the Change password page BEFORE anything else.
  try {
    const next = await afterLogin(supabase, data.user)
    if (next) {
      loading.value = false
      router.replace(next)
      return
    }
  } catch (err) {
    errorMessage.value = err.message
    loading.value = false
    return
  }

  const { data: profile, error: profileError } = await supabase.rpc('get_my_profile')

  // Every failure below signs out again: before, the error was shown but
  // the session stayed active, so the pages could still be opened.
  if (profileError) {
    await supabase.auth.signOut()
    errorMessage.value = profileError.message
    loading.value = false
    return
  }

  if (!profile) {
    await supabase.auth.signOut()
    errorMessage.value = 'Profile record not found in profiles table.'
    loading.value = false
    return
  }

  if (profile.is_active === false || profile.is_hidden === true) {
    await supabase.auth.signOut()
    errorMessage.value = 'This account is disabled.'
    loading.value = false
    return
  }

  localStorage.setItem(
    'currentUser',
    JSON.stringify({
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role,
      is_active: profile.is_active,
    })
  )

  localStorage.setItem('user_id', profile.id)
  localStorage.setItem('full_name', profile.full_name)
  localStorage.setItem('email', profile.email)
  localStorage.setItem('role', profile.role)

  if (profile.role === 'admin') {
    router.push('/')
  } else if (profile.role === 'cashier') {
    router.push('/')
  } else if (profile.role === 'staff') {
    router.push('/')
  } else if (profile.role === 'supplier') {
    router.push('/')
  }else {
    router.push('/')
  }

  loading.value = false
}

async function forgotPassword() {
  errorMessage.value = ''

  if (!email.value.trim()) {
    errorMessage.value = 'Enter your email first.'
    return
  }

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.value.trim()
  )

  if (error) {
    errorMessage.value = error.message
    return
  }

  alert('Password reset email sent.')
}
</script>