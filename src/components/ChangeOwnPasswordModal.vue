<script setup>
// The logged-in user changes their OWN password (admin and cashier Profile).
// Same look as the other "type your password" popups.
//   Step 1: enter your current password (checked right away)
//   Step 2: choose the new password
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { PASSWORD_RULES } from '../lib/passwordStatus'
// a pasted password loses the invisible characters it brought along
import { vClean } from '../lib/cleanText'

const emit = defineEmits(['close'])
const router = useRouter()

const step = ref(1) // 1 = current password, 2 = new password, 3 = done
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')
const firstInput = ref(null)

onMounted(() => nextTick(() => firstInput.value?.focus()))

const rules = computed(() =>
  PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(newPassword.value) }))
)
const allRulesOk = computed(() => rules.value.every((r) => r.ok))
const mismatch = computed(
  () => confirmPassword.value && newPassword.value !== confirmPassword.value
)
const sameAsCurrent = computed(
  () => newPassword.value && newPassword.value === currentPassword.value
)
const canSave = computed(
  () => allRulesOk.value && confirmPassword.value && !mismatch.value && !sameAsCurrent.value && !busy.value
)

async function getEmail() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.email || null
}

// Step 1: is this really the owner? Check the current password.
async function checkCurrent() {
  if (!currentPassword.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const email = await getEmail()
    if (!email) {
      error.value = 'Your session expired. Please log in again.'
      return
    }
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword.value,
    })
    if (verifyErr) {
      error.value = 'Incorrect password. Please try again.'
      currentPassword.value = ''
      nextTick(() => firstInput.value?.focus())
      return
    }
    step.value = 2
    show.value = false
    nextTick(() => firstInput.value?.focus())
  } finally {
    busy.value = false
  }
}

// Step 2: save the new password.
async function saveNew() {
  if (!canSave.value) return
  busy.value = true
  error.value = ''
  try {
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword.value,
    })
    if (updateErr) {
      error.value = updateErr.message || 'Could not change the password.'
      return
    }

    // Keep the session valid with the new password.
    const email = await getEmail()
    const { error: reErr } = email
      ? await supabase.auth.signInWithPassword({ email, password: newPassword.value })
      : { error: true }

    currentPassword.value = newPassword.value = confirmPassword.value = ''

    if (reErr) {
      router.replace({ path: '/login' })
      return
    }
    step.value = 3
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
  <div class="ap-backdrop" role="dialog" aria-modal="true" @keydown.esc="emit('close')">

    <!-- STEP 1: your password -->
    <form v-if="step === 1" class="ap-card" @submit.prevent="checkCurrent">
      <h2>Reset your password</h2>
      <p class="ap-message">
        Enter your current password to confirm it's really you.
      </p>

      <label class="ap-label" for="op-current">Your password</label>
      <div class="ap-field">
        <input id="op-current" ref="firstInput" v-model="currentPassword" v-clean:password
               :type="show ? 'text' : 'password'" autocomplete="current-password" />
        <button type="button" class="ap-toggle" @click="show = !show">
          {{ show ? 'Hide' : 'Show' }}
        </button>
      </div>

      <p v-if="error" class="ap-error" role="alert">{{ error }}</p>

      <div class="ap-actions">
        <button type="button" class="ap-cancel" :disabled="busy" @click="emit('close')">Cancel</button>
        <button type="submit" class="ap-confirm" :disabled="!currentPassword || busy">
          {{ busy ? 'Checking…' : 'Continue' }}
        </button>
      </div>
    </form>

    <!-- STEP 2: new password -->
    <form v-else-if="step === 2" class="ap-card" @submit.prevent="saveNew">
      <h2>Choose a new password</h2>
      <p class="ap-message">Your password was confirmed. Now set your new password.</p>

      <label class="ap-label" for="op-new">New password</label>
      <div class="ap-field">
        <input id="op-new" ref="firstInput" v-model="newPassword" v-clean:password
               :type="show ? 'text' : 'password'" autocomplete="new-password" />
        <button type="button" class="ap-toggle" @click="show = !show">
          {{ show ? 'Hide' : 'Show' }}
        </button>
      </div>

      <ul class="ap-rules" :class="{ typing: newPassword }">
        <li v-for="r in rules" :key="r.label" :class="r.ok ? 'ok' : ''">
          {{ r.ok ? '✓' : '○' }} {{ r.label }}
        </li>
      </ul>

      <label class="ap-label" for="op-confirm">Confirm new password</label>
      <div class="ap-field">
        <input id="op-confirm" v-model="confirmPassword" v-clean:password
               :type="show ? 'text' : 'password'" autocomplete="new-password" />
      </div>

      <p v-if="mismatch" class="ap-error">Passwords do not match.</p>
      <p v-else-if="sameAsCurrent" class="ap-error">
        The new password must be different from the current one.
      </p>
      <p v-if="error" class="ap-error" role="alert">{{ error }}</p>

      <div class="ap-actions">
        <button type="button" class="ap-cancel" :disabled="busy" @click="emit('close')">Cancel</button>
        <button type="submit" class="ap-confirm" :disabled="!canSave">
          {{ busy ? 'Saving…' : 'Reset password' }}
        </button>
      </div>
    </form>

    <!-- DONE -->
    <div v-else class="ap-card">
      <h2>Password changed</h2>
      <p class="ap-message">Your password was updated. Use the new one next time you log in.</p>
      <div class="ap-actions">
        <button type="button" class="ap-confirm" @click="emit('close')">Done</button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.ap-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: grid; place-items: center; padding: 16px; z-index: 2100; overflow-y: auto; }
.ap-card { width: 100%; max-width: 420px; background: #141417; border: 1px solid #26262b; border-radius: 16px; padding: 24px; color: #f4f4f5; }
h2 { margin: 0 0 6px; font-size: 1.2rem; }
.ap-message { margin: 0 0 14px; color: #a1a1aa; font-size: .9rem; line-height: 1.45; }
.ap-label { display: block; font-size: .8rem; font-weight: 600; color: #d4d4d8; margin: 12px 0 6px; }
.ap-field { display: flex; background: #0e0e11; border: 1px solid #2e2e34; border-radius: 10px; overflow: hidden; }
.ap-field:focus-within { border-color: #e11d48; }
.ap-field input { flex: 1; min-width: 0; background: transparent; border: 0; color: inherit; padding: 11px 12px; font-size: .95rem; outline: none; }
.ap-toggle { background: transparent; border: 0; color: #a1a1aa; padding: 0 12px; cursor: pointer; font-size: .8rem; }
.ap-rules { list-style: none; margin: 8px 0 0; padding: 0; font-size: .8rem; color: #71717a; display: grid; gap: 2px; }
.ap-rules .ok { color: #34d399; }
/* once typing has started, unmet rules turn red instead of staying grey */
.ap-rules.typing li:not(.ok) { color: #fda4af; }
.ap-error { margin: 10px 0 0; font-size: .85rem; color: #fda4af; background: rgba(225,29,72,.12); border: 1px solid rgba(225,29,72,.4); border-radius: 10px; padding: 8px 10px; }
.ap-actions { display: flex; gap: 10px; margin-top: 18px; }
.ap-actions button { flex: 1; padding: 11px; border: 0; border-radius: 10px; font-weight: 700; cursor: pointer; }
.ap-cancel { background: #26262b; color: #f4f4f5; }
.ap-confirm { background: #e11d48; color: #fff; }
.ap-actions button:disabled { opacity: .45; cursor: not-allowed; }
</style>