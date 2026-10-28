<template>
  <div class="flex min-h-screen items-center justify-center bg-black px-4 text-white">
    <div class="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-8 shadow-2xl">
      <div>
        <h1 class="text-3xl font-extrabold text-red-500">10 FIVE 7</h1>
        <h1 class="text-lg font-bold tracking-wide text-white">HARDWARE</h1>
      </div>

      <p class="mt-2 text-zinc-400">
        {{ mode === 'forgot' ? 'Reset your password' : 'Login to Inventory Management System' }}
      </p>

      <!-- FORGOT PASSWORD, step 2: the 6-digit code from the email -->
      <form v-if="mode === 'forgot' && resetSent" @submit.prevent="verifyCode" class="mt-8 space-y-4">
        <p class="text-sm text-zinc-400">
          We sent a code to <b class="text-white">{{ resetEmail.trim() }}</b>.
          Enter it below (or use the link in the email).
        </p>

        <div>
          <label class="text-sm text-zinc-400" for="reset-code">Code</label>

          <input
            id="reset-code"
            ref="resetCodeInput"
            v-model="resetCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="10"
            required
            class="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-red-500"
            placeholder="••••••"
            @input="resetCode = resetCode.replace(/\D/g, ''); errorMessage = ''"
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
          :disabled="verifying || resetCode.length < 6"
          class="w-full rounded-2xl bg-red-600 py-3 font-bold transition hover:bg-red-700 disabled:opacity-50"
        >
          {{ verifying ? 'Checking...' : 'Continue' }}
        </button>

        <div class="flex justify-between gap-3 text-sm font-semibold">
          <button type="button" class="text-zinc-400 hover:text-red-400" @click="resetSent = false">
            ← Change email
          </button>
          <button
            type="button"
            class="text-zinc-400 hover:text-red-400 disabled:opacity-50"
            :disabled="sendingReset"
            @click="forgotPassword"
          >
            {{ sendingReset ? 'Sending...' : 'Send a new code' }}
          </button>
        </div>
      </form>

      <!-- FORGOT PASSWORD, step 1: its own screen, asks only for the email -->
      <form v-else-if="mode === 'forgot'" @submit.prevent="forgotPassword" class="mt-8 space-y-4">
        <p class="text-sm text-zinc-400">
          Enter the email of your account. We'll send you a code to choose a new password.
        </p>

        <div>
          <label class="text-sm text-zinc-400">Email</label>

          <input
            ref="resetEmailInput"
            v-model="resetEmail"
            type="email"
            required
            autocomplete="email"
            class="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 outline-none focus:border-red-500"
            placeholder="Enter email"
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
          :disabled="sendingReset"
          class="w-full rounded-2xl bg-red-600 py-3 font-bold transition hover:bg-red-700 disabled:opacity-50"
        >
          {{ sendingReset ? 'Sending...' : 'Send code' }}
        </button>

        <button
          type="button"
          class="mt-3 w-full text-sm font-semibold text-zinc-400 hover:text-red-400"
          @click="showLogin"
        >
          ← Back to login
        </button>
      </form>

      <form v-else @submit.prevent="login" class="mt-8 space-y-4">
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

          <div class="relative mt-2">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              class="w-full rounded-2xl border border-white/10 bg-black py-3 pl-4 pr-20 outline-none focus:border-red-500"
              placeholder="Enter password"
            />

            <button
              type="button"
              class="absolute inset-y-0 right-0 px-4 text-sm font-semibold text-zinc-400 hover:text-white"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
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
          @click="showForgot"
        >
          Forgot password?
        </button>
      </form>
    </div>

    <!-- TOAST: good news pops up at the bottom and hides itself -->
    <div class="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <Transition name="toast">
        <div
          v-if="infoMessage"
          role="status"
          class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-emerald-500/30 bg-zinc-900 p-4 text-sm text-emerald-300 shadow-2xl"
        >
          <span class="font-bold text-emerald-400" aria-hidden="true">✓</span>
          <p class="flex-1">{{ infoMessage }}</p>
          <button
            type="button"
            class="text-zinc-500 hover:text-white"
            aria-label="Close message"
            @click="infoMessage = ''"
          >
            ✕
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { afterLogin } from '../../lib/passwordStatus'
import { markActivity } from '../../lib/idleLogout'
import { markLoggedIn } from '../../lib/browserSession'
import { startPasswordRecovery } from '../../lib/passwordRecovery'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
// shows e.g. "Your temporary password has expired..." after being sent back here
const errorMessage = ref(route.query.notice ? String(route.query.notice) : '')
// good news, e.g. "Your password was changed..." after a password reset
const infoMessage = ref(route.query.info ? String(route.query.info) : '')
const sendingReset = ref(false)
const resetSent = ref(false) // the email went out: show the code step
const resetCode = ref('')
const resetCodeInput = ref(null)
const verifying = ref(false)

// The good-news toast hides itself after a few seconds.
let toastTimer = null

watch(
  infoMessage,
  (message) => {
    clearTimeout(toastTimer)
    if (message) toastTimer = setTimeout(() => (infoMessage.value = ''), 6000)
  },
  { immediate: true }
)

onBeforeUnmount(() => clearTimeout(toastTimer))

// 'login' or 'forgot' (the "Forgot password?" screen)
const mode = ref('login')
const resetEmail = ref('')
const resetEmailInput = ref(null)

function showForgot() {
  mode.value = 'forgot'
  resetEmail.value = email.value.trim() // keep what was already typed
  resetSent.value = false
  errorMessage.value = ''
  nextTick(() => resetEmailInput.value?.focus())
}

// The toast (if any) stays until it hides itself.
function showLogin() {
  mode.value = 'login'
  if (resetEmail.value.trim()) email.value = resetEmail.value.trim()
  errorMessage.value = ''
}

async function login() {
  loading.value = true
  errorMessage.value = ''
  infoMessage.value = ''

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  })

  if (error) {
    errorMessage.value = error.message
    loading.value = false
    return
  }

  // fresh login: restart the auto-logout clock, and remember it until the
  // browser app is closed (see lib/browserSession.js)
  markActivity()
  markLoggedIn()

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
  infoMessage.value = ''

  const address = resetEmail.value.trim()

  if (!address) {
    errorMessage.value = 'Enter your email.'
    return
  }

  sendingReset.value = true

  // The email's link opens /reset-password on this same site. That address
  // must be listed under Supabase > Authentication > URL Configuration.
  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  sendingReset.value = false

  if (error) {
    errorMessage.value = error.message
    return
  }

  resetSent.value = true
  resetCode.value = ''
  nextTick(() => resetCodeInput.value?.focus())

  // Same message whether or not the account exists, so this can't be used
  // to find out which emails have accounts.
  infoMessage.value =
    `If ${address} has an account, a code to reset the password was sent to it. ` +
    'Check the inbox (and the spam folder).'
}

// The code from the email logs in just for the reset, then the Reset
// password page asks for the new password (same as opening the link).
async function verifyCode() {
  errorMessage.value = ''
  verifying.value = true

  const { error } = await supabase.auth.verifyOtp({
    email: resetEmail.value.trim(),
    token: resetCode.value,
    type: 'recovery',
  })

  verifying.value = false

  if (error) {
    errorMessage.value = /expired|invalid/i.test(error.message)
      ? 'That code is wrong or has expired. Check the newest email, or press "Send a new code".'
      : error.message
    return
  }

  startPasswordRecovery()
  router.replace('/reset-password')
}
</script>