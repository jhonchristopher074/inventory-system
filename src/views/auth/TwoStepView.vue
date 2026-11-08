<template>
  <!-- After the password, when two-step verification is on: the 6-digit
       code from the authenticator app (lib/twoStep.js). The router sends
       every page here until it's entered. -->
  <div class="ts-page">
    <form class="ts-card" novalidate @submit.prevent="submit">
      <span class="ts-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </span>

      <template v-if="!recovery">
        <h1>Two-step verification</h1>
        <p class="ts-sub">Open your authenticator app and enter the 6-digit code for <b>10 FIVE 7 Hardware</b>.</p>

        <label class="sr-only" for="ts-code">6-digit code</label>
        <input
          id="ts-code"
          ref="codeInput"
          v-model="code"
          class="ts-code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="000000"
          data-free-number
          :disabled="busy"
          @input="onCodeInput"
        />
        <p class="ts-hint">The code changes every 30 seconds.</p>
      </template>

      <template v-else>
        <h1>Use a recovery code</h1>
        <p class="ts-sub">
          Enter one of the 8 codes you saved when you turned on two-step verification. It turns two-step
          verification <b>off</b>, so you can log in and set it up again on your new phone.
        </p>

        <label class="sr-only" for="ts-recovery">Recovery code</label>
        <input
          id="ts-recovery"
          ref="recoveryInput"
          v-model="recoveryCode"
          class="ts-code ts-code-sm"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="11"
          placeholder="A1B2C-3D4E5"
          :disabled="busy"
        />
      </template>

      <p v-if="error" class="ts-alert" role="alert">{{ error }}</p>

      <button type="submit" class="ts-submit" :disabled="busy || !canSubmit">
        {{ busy ? 'Checking…' : recovery ? 'Use recovery code' : 'Verify' }}
      </button>

      <button type="button" class="ts-link" :disabled="busy" @click="toggleRecovery">
        {{ recovery ? 'Back to the 6-digit code' : 'Lost your phone? Use a recovery code' }}
      </button>
      <button type="button" class="ts-link" :disabled="busy" @click="logout">Log out</button>
    </form>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { clearCurrentUser } from '../../lib/currentUser'
import { useRecoveryCode as spendRecoveryCode, verifyCode } from '../../lib/twoStep'
import { toast } from '../../lib/toast'

const route = useRoute()
const router = useRouter()

const code = ref('')
const recoveryCode = ref('')
const recovery = ref(false)
const busy = ref(false)
const error = ref('')
const codeInput = ref(null)
const recoveryInput = ref(null)

const canSubmit = computed(() =>
  recovery.value
    ? recoveryCode.value.replace(/[^0-9a-f]/gi, '').length === 10
    : code.value.length === 6
)

// where to go after: the page that was asked for (only a page of this app)
function next() {
  const target = typeof route.query.next === 'string' ? route.query.next : '/'
  return target.startsWith('/') && !target.startsWith('//') ? target : '/'
}

// digits only; the 6th one sends it
function onCodeInput() {
  code.value = code.value.replace(/\D/g, '').slice(0, 6)
  error.value = ''
  if (code.value.length === 6) submit()
}

async function submit() {
  if (busy.value || !canSubmit.value) return
  busy.value = true
  error.value = ''

  try {
    if (recovery.value) {
      await spendRecoveryCode(recoveryCode.value)
      toast('Two-step verification is off. Set it up again in Profile & Users.', { ms: 8000 })
    } else {
      await verifyCode(code.value)
    }
    await router.replace(next())
  } catch (err) {
    error.value = err.message
    code.value = ''
    await nextTick()
    ;(recovery.value ? recoveryInput : codeInput).value?.focus()
  } finally {
    busy.value = false
  }
}

async function toggleRecovery() {
  recovery.value = !recovery.value
  error.value = ''
  await nextTick()
  ;(recovery.value ? recoveryInput : codeInput).value?.focus()
}

async function logout() {
  await supabase.auth.signOut({ scope: 'local' })
  clearCurrentUser()
  router.replace('/login')
}

onMounted(() => codeInput.value?.focus())
</script>

<style scoped>
.ts-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 16px;
  background: #0b0b0d;
}

.ts-card {
  width: 100%;
  max-width: 400px;
  border: 1px solid #26262b;
  border-radius: 20px;
  background: #141417;
  padding: 30px 28px;
  text-align: center;
  color: #f4f4f5;
}

.ts-icon {
  display: grid;
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  place-items: center;
  border-radius: 999px;
  background: rgba(225, 29, 72, 0.14);
  color: #fb7185;
}

.ts-icon svg {
  width: 26px;
  height: 26px;
}

h1 {
  margin: 0 0 6px;
  font-size: 1.35rem;
  font-weight: 800;
}

.ts-sub {
  margin: 0 0 20px;
  font-size: 0.9rem;
  color: #a1a1aa;
}

.ts-sub b {
  color: #e4e4e7;
}

.ts-code {
  width: 100%;
  border: 1px solid #2e2e34;
  border-radius: 14px;
  background: #0e0e11;
  padding: 14px 12px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 0.45em;
  text-indent: 0.45em; /* the letter spacing after the last digit: keeps it centred */
  color: #fff;
  outline: none;
}

.ts-code-sm {
  font-size: 1.35rem;
  letter-spacing: 0.15em;
  text-indent: 0.15em;
  text-transform: uppercase;
}

.ts-code::placeholder {
  color: #3f3f46;
}

.ts-code:focus {
  border-color: #e11d48;
  box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.18);
}

.ts-hint {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: #71717a;
}

.ts-alert {
  margin: 16px 0 0;
  border: 1px solid rgba(225, 29, 72, 0.4);
  border-radius: 10px;
  background: rgba(225, 29, 72, 0.12);
  padding: 10px 12px;
  font-size: 0.85rem;
  color: #fda4af;
}

.ts-submit {
  width: 100%;
  margin-top: 20px;
  border: 0;
  border-radius: 12px;
  background: #e11d48;
  padding: 12px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
}

.ts-submit:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.ts-link {
  width: 100%;
  margin-top: 10px;
  border: 0;
  background: transparent;
  font-size: 0.85rem;
  color: #a1a1aa;
  cursor: pointer;
}

.ts-link:hover:not(:disabled) {
  color: #f4f4f5;
}
</style>
