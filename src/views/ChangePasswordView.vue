<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase' // adjust to your project's Supabase client path
import { PASSWORD_RULES, EXPIRED_MESSAGE } from '../lib/passwordStatus'
// pasted passwords lose invisible characters; the temporary one (letters and
// numbers only) loses spaces too
import { vClean } from '../lib/cleanText'

const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)
const loading = ref(false)
const error = ref('')
const success = ref('')

const rules = computed(() =>
  PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(newPassword.value) }))
)
const allRulesOk = computed(() => rules.value.every((r) => r.ok))
const sameAsTemp = computed(() => newPassword.value && newPassword.value === currentPassword.value)
const mismatch = computed(() => confirmPassword.value && newPassword.value !== confirmPassword.value)
const canSubmit = computed(
  () => currentPassword.value && allRulesOk.value && !sameAsTemp.value &&
        confirmPassword.value && !mismatch.value && !loading.value
)

// Shown on the disabled button, so it's clear why it can't be pressed.
const blockReason = computed(() => {
  if (!currentPassword.value) return 'Enter your temporary password'
  const missing = rules.value.find((r) => !r.ok)
  if (missing) return `New password needs: ${missing.label.toLowerCase()}`
  if (sameAsTemp.value) return 'Must be different from the temporary password'
  if (!confirmPassword.value) return 'Confirm your new password'
  if (mismatch.value) return 'Passwords do not match'
  return ''
})

async function submit() {
  error.value = ''
  success.value = ''

  if (!allRulesOk.value) return (error.value = 'Your new password does not meet all the requirements.')
  if (newPassword.value !== confirmPassword.value) return (error.value = 'Passwords do not match.')
  if (sameAsTemp.value) return (error.value = 'New password must be different from the temporary password.')

  loading.value = true
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const userEmail = sessionData?.session?.user?.email
    if (!userEmail) return router.replace({ path: '/login' })

    const { data, error: fnError } = await supabase.functions.invoke('complete-password-change', {
      body: { current_password: currentPassword.value, new_password: newPassword.value },
    })

    if (fnError) {
      // Read the server's message (passwords are never included in it).
      let payload = {}
      try { payload = await fnError.context.json() } catch { /* ignore */ }
      if (payload.code === 'TEMP_EXPIRED') {
        await supabase.auth.signOut()
        return router.replace({ name: 'login', query: { notice: EXPIRED_MESSAGE } })
      }
      error.value = payload.error || 'Something went wrong. Please try again.'
      return
    }

    if (data?.ok) {
      // Changing the password ends the old session on the server, but the
      // browser still holds it (with the "temporary password" flag). Drop it
      // here first — otherwise every redirect sees that stale session and
      // bounces straight back to this page with the form cleared.
      const savedPassword = newPassword.value
      currentPassword.value = newPassword.value = confirmPassword.value = ''
      success.value = 'Password saved! Taking you to your dashboard…'

      await supabase.auth.signOut({ scope: 'local' })

      // Sign in fresh: the new token has the temporary flag cleared.
      const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: savedPassword,
      })
      if (signInErr || !signIn?.user) {
        return router.replace({
          path: '/login',
          query: { notice: 'Your password was saved. Please log in with your new password.' },
        })
      }

      const { data: profile } = await supabase.rpc('get_my_profile')
      if (!profile || profile.is_active === false) {
        await supabase.auth.signOut()
        return router.replace({ path: '/login' })
      }

      // Same values the login page stores.
      localStorage.setItem('currentUser', JSON.stringify({
        id: profile.id, full_name: profile.full_name, email: profile.email,
        role: profile.role, is_active: profile.is_active,
      }))
      localStorage.setItem('user_id', profile.id)
      localStorage.setItem('full_name', profile.full_name)
      localStorage.setItem('email', profile.email)
      localStorage.setItem('role', profile.role)

      const home = { admin: '/', cashier: '/cashier', staff: '/staff', supplier: '/SupplierDropBoxView' }
      router.replace({ path: home[profile.role] || '/' })
    }
  } finally {
    loading.value = false
  }
}

async function logout() {
  await supabase.auth.signOut()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="cp-page">
    <form class="cp-card" @submit.prevent="submit" novalidate>
      <h1>Change your password</h1>
      <p class="cp-sub">
        You're signed in with a temporary password. Set your own password to continue.
      </p>

      <label class="cp-label" for="cp-current">Temporary password</label>
      <div class="cp-field">
        <input id="cp-current" v-model="currentPassword" v-clean:nospaces :type="showCurrent ? 'text' : 'password'"
               autocomplete="current-password" required />
        <button type="button" class="cp-toggle" @click="showCurrent = !showCurrent"
                :aria-label="showCurrent ? 'Hide password' : 'Show password'">
          {{ showCurrent ? 'Hide' : 'Show' }}
        </button>
      </div>

      <label class="cp-label" for="cp-new">New password</label>
      <div class="cp-field">
        <input id="cp-new" v-model="newPassword" v-clean:password :type="showNew ? 'text' : 'password'"
               autocomplete="new-password" required />
        <button type="button" class="cp-toggle" @click="showNew = !showNew"
                :aria-label="showNew ? 'Hide password' : 'Show password'">
          {{ showNew ? 'Hide' : 'Show' }}
        </button>
      </div>

      <ul class="cp-rules" :class="{ typing: newPassword }" aria-label="Password requirements">
        <li v-for="r in rules" :key="r.label" :class="{ ok: r.ok }">
          <span aria-hidden="true">{{ r.ok ? '✓' : '•' }}</span> {{ r.label }}
        </li>
        <li :class="{ ok: newPassword && !sameAsTemp }">
          <span aria-hidden="true">{{ newPassword && !sameAsTemp ? '✓' : '•' }}</span>
          Different from the temporary password
        </li>
      </ul>

      <label class="cp-label" for="cp-confirm">Confirm new password</label>
      <div class="cp-field">
        <input id="cp-confirm" v-model="confirmPassword" v-clean:password :type="showConfirm ? 'text' : 'password'"
               autocomplete="new-password" required />
        <button type="button" class="cp-toggle" @click="showConfirm = !showConfirm"
                :aria-label="showConfirm ? 'Hide password' : 'Show password'">
          {{ showConfirm ? 'Hide' : 'Show' }}
        </button>
      </div>
      <p v-if="mismatch" class="cp-inline-error">Passwords do not match.</p>

      <p v-if="error" class="cp-alert cp-alert-error" role="alert">{{ error }}</p>
      <p v-if="success" class="cp-alert cp-alert-success" role="status">{{ success }}</p>

      <button type="submit" class="cp-submit" :disabled="!canSubmit">
        {{ loading ? 'Saving…' : (blockReason || 'Save Password') }}
      </button>
      <button type="button" class="cp-link" @click="logout">Log out</button>
    </form>
  </div>
</template>

<style scoped>
/* Matches the dark + red theme of the 10 FIVE 7 dashboard. Swap in your
   own CSS variables or components if you have them. */
.cp-page { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #0b0b0d; }
.cp-card { width: 100%; max-width: 420px; background: #141417; border: 1px solid #26262b;
  border-radius: 16px; padding: 28px; color: #f4f4f5; }
h1 { font-size: 1.4rem; margin: 0 0 6px; }
.cp-sub { color: #a1a1aa; font-size: .9rem; margin: 0 0 20px; }
.cp-label { display: block; font-size: .8rem; font-weight: 600; color: #d4d4d8; margin: 14px 0 6px; }
.cp-field { display: flex; background: #0e0e11; border: 1px solid #2e2e34; border-radius: 10px; overflow: hidden; }
.cp-field:focus-within { border-color: #e11d48; }
.cp-field input { flex: 1; min-width: 0; background: transparent; border: 0; color: inherit; padding: 11px 12px; font-size: .95rem; outline: none; }
.cp-toggle { background: transparent; border: 0; color: #a1a1aa; padding: 0 12px; cursor: pointer; font-size: .8rem; }
.cp-toggle:hover { color: #f4f4f5; }
.cp-rules { list-style: none; padding: 0; margin: 10px 0 0; font-size: .8rem; color: #71717a; display: grid; gap: 3px; }
.cp-rules li.ok { color: #22c55e; }
/* once typing has started, unmet rules turn red instead of staying grey */
.cp-rules.typing li:not(.ok) { color: #f87171; }
.cp-inline-error { color: #f87171; font-size: .8rem; margin: 6px 0 0; }
.cp-alert { border-radius: 10px; padding: 10px 12px; font-size: .85rem; margin: 16px 0 0; }
.cp-alert-error { background: rgba(225, 29, 72, .12); color: #fda4af; border: 1px solid rgba(225, 29, 72, .4); }
.cp-alert-success { background: rgba(34, 197, 94, .12); color: #86efac; border: 1px solid rgba(34, 197, 94, .4); }
.cp-submit { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 10px;
  background: #e11d48; color: #fff; font-weight: 700; cursor: pointer; }
.cp-submit:disabled { opacity: .45; cursor: not-allowed; }
.cp-link { width: 100%; margin-top: 10px; background: transparent; border: 0; color: #a1a1aa; cursor: pointer; font-size: .85rem; }
</style>