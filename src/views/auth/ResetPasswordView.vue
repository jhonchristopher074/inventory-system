<script setup>
// Set a new password after opening the link from a "Forgot password?" email.
// Only works when the app was opened from such a link (lib/passwordRecovery.js);
// otherwise it explains how to get one.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { PASSWORD_RULES } from '../../lib/passwordStatus'
import { isPasswordRecovery, endPasswordRecovery } from '../../lib/passwordRecovery'
// a pasted password loses the invisible characters it brought along
import { vClean } from '../../lib/cleanText'

const router = useRouter()

const ready = ref(false)   // finished checking the link
const allowed = ref(false) // opened from a valid reset link
const email = ref('')

const newPassword = ref('')
const confirmPassword = ref('')
const show = ref(false)
const loading = ref(false)
const error = ref('')

const rules = computed(() =>
  PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(newPassword.value) }))
)
const mismatch = computed(() => confirmPassword.value && newPassword.value !== confirmPassword.value)

// Shown on the disabled button, so it's clear why it can't be pressed.
const blockReason = computed(() => {
  const missing = rules.value.find((r) => !r.ok)
  if (missing) return `New password needs: ${missing.label.toLowerCase()}`
  if (!confirmPassword.value) return 'Confirm your new password'
  if (mismatch.value) return 'Passwords do not match'
  return ''
})

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  allowed.value = Boolean(session) && isPasswordRecovery()
  email.value = session?.user?.email || ''
  ready.value = true
})

async function submit() {
  error.value = ''
  if (blockReason.value || loading.value) return

  loading.value = true

  try {
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword.value,
    })

    if (updateError) {
      error.value = /different from the old/i.test(updateError.message)
        ? 'Choose a password that is different from your old one.'
        : updateError.message
      return
    }

    await clearTemporaryMark()

    endPasswordRecovery()
    newPassword.value = confirmPassword.value = ''

    // log in again with the new password, so it's clear it works
    await supabase.auth.signOut({ scope: 'local' })
    router.replace({
      path: '/login',
      query: { info: 'Your password was changed. Log in with your new password.' },
    })
  } finally {
    loading.value = false
  }
}

// An employee who never replaced their first temporary password is still
// marked as having one: logging in would then ask for it again, or refuse
// it as expired. The reset email proved it's them, so the server clears that
// mark (supabase/functions/finish-password-reset). Nobody else needs this,
// and the new password is already saved, so a failure never stops the reset.
async function clearTemporaryMark() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.app_metadata?.must_change_password) return

  const { error: fnError } = await supabase.functions.invoke('finish-password-reset', { body: {} })
  if (fnError) console.error('Could not clear the temporary-password mark:', fnError)
}

async function cancel() {
  endPasswordRecovery()
  await supabase.auth.signOut({ scope: 'local' })
  router.replace({ path: '/login' })
}
</script>

<template>
  <div class="cp-page">
    <div v-if="!ready" class="cp-card">
      <p class="cp-sub">Checking your reset link…</p>
    </div>

    <div v-else-if="!allowed" class="cp-card">
      <h1>This reset link doesn't work</h1>
      <p class="cp-sub">
        This page only opens from the link in a password-reset email. Each link works once and
        expires after a while.
      </p>
      <p class="cp-sub">
        To get a new one, enter your email on the login page and press <b>Forgot password?</b> —
        or ask the owner to reset your password.
      </p>
      <button type="button" class="cp-submit" @click="router.replace('/login')">
        Go to login
      </button>
    </div>

    <form v-else class="cp-card" novalidate @submit.prevent="submit">
      <h1>Set a new password</h1>
      <p class="cp-sub">
        For <b>{{ email }}</b>. Choose a new password to finish resetting it.
      </p>

      <label class="cp-label" for="rp-new">New password</label>
      <div class="cp-field">
        <input
          id="rp-new"
          v-model="newPassword"
          v-clean:password
          :type="show ? 'text' : 'password'"
          autocomplete="new-password"
          required
        />
        <button
          type="button"
          class="cp-toggle"
          :aria-label="show ? 'Hide password' : 'Show password'"
          @click="show = !show"
        >
          {{ show ? 'Hide' : 'Show' }}
        </button>
      </div>

      <ul class="cp-rules" :class="{ typing: newPassword }" aria-label="Password requirements">
        <li v-for="r in rules" :key="r.label" :class="{ ok: r.ok }">
          <span aria-hidden="true">{{ r.ok ? '✓' : '•' }}</span> {{ r.label }}
        </li>
      </ul>

      <label class="cp-label" for="rp-confirm">Confirm new password</label>
      <div class="cp-field">
        <input
          id="rp-confirm"
          v-model="confirmPassword"
          v-clean:password
          :type="show ? 'text' : 'password'"
          autocomplete="new-password"
          required
        />
      </div>
      <p v-if="mismatch" class="cp-inline-error">Passwords do not match.</p>

      <p v-if="error" class="cp-alert cp-alert-error" role="alert">{{ error }}</p>

      <button type="submit" class="cp-submit" :disabled="Boolean(blockReason) || loading">
        {{ loading ? 'Saving…' : (blockReason || 'Save new password') }}
      </button>
      <button type="button" class="cp-link" @click="cancel">Cancel</button>
    </form>
  </div>
</template>

<style scoped>
/* Same look as the Change Password page. */
.cp-page { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #0b0b0d; }
.cp-card { width: 100%; max-width: 420px; background: #141417; border: 1px solid #26262b;
  border-radius: 16px; padding: 28px; color: #f4f4f5; }
h1 { font-size: 1.4rem; margin: 0 0 6px; }
.cp-sub { color: #a1a1aa; font-size: .9rem; margin: 0 0 16px; line-height: 1.45; }
.cp-label { display: block; font-size: .8rem; font-weight: 600; color: #d4d4d8; margin: 14px 0 6px; }
.cp-field { display: flex; background: #0e0e11; border: 1px solid #2e2e34; border-radius: 10px; overflow: hidden; }
.cp-field:focus-within { border-color: #e11d48; }
.cp-field input { flex: 1; min-width: 0; background: transparent; border: 0; color: inherit; padding: 11px 12px; font-size: .95rem; outline: none; }
.cp-toggle { background: transparent; border: 0; color: #a1a1aa; padding: 0 12px; cursor: pointer; font-size: .8rem; }
.cp-toggle:hover { color: #f4f4f5; }
.cp-rules { list-style: none; padding: 0; margin: 10px 0 0; font-size: .8rem; color: #71717a; display: grid; gap: 3px; }
.cp-rules li.ok { color: #22c55e; }
.cp-rules.typing li:not(.ok) { color: #f87171; }
.cp-inline-error { color: #f87171; font-size: .8rem; margin: 6px 0 0; }
.cp-alert { border-radius: 10px; padding: 10px 12px; font-size: .85rem; margin: 16px 0 0; }
.cp-alert-error { background: rgba(225, 29, 72, .12); color: #fda4af; border: 1px solid rgba(225, 29, 72, .4); }
.cp-submit { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 10px;
  background: #e11d48; color: #fff; font-weight: 700; cursor: pointer; }
.cp-submit:disabled { opacity: .45; cursor: not-allowed; }
.cp-link { width: 100%; margin-top: 10px; background: transparent; border: 0; color: #a1a1aa; cursor: pointer; font-size: .85rem; }
</style>
