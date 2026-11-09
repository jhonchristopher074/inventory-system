<template>
  <!-- The Owner's two-step verification (Profile & Users header): its state
       on the button, and a window to turn it on (code by email, or an
       authenticator app), see recovery codes or turn it off (lib/twoStep.js). -->
  <button
    type="button"
    class="ts-btn"
    :class="isOn ? 'is-on' : 'is-off'"
    :title="isOn ? 'Two-step verification is on' : 'Two-step verification is off: set it up'"
    @click="openWindow"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path v-if="isOn" d="M9 12l2 2 4-4" />
    </svg>
    Two-step: {{ loaded ? (isOn ? 'On' : 'Off') : '…' }}
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[1500] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ts-title"
      @click.self="close"
      @keydown.esc="close"
    >
      <div class="flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto rounded-[24px] border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Security</p>
            <h2 id="ts-title" class="text-xl font-extrabold text-white">Two-step verification</h2>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700"
            aria-label="Close"
            :disabled="busy"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- OFF: pick how the code comes -->
        <template v-if="step === 'off'">
          <p class="text-sm text-zinc-300">
            After your password, the Owner account will also ask for a <b class="text-white">6-digit code</b>.
            Someone who learns your password still can't get in. How should the code come?
          </p>

          <div class="mt-4 grid gap-2">
            <button type="button" class="choice" :disabled="busy" @click="beginEmail">
              <span class="choice-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
                </svg>
              </span>
              <span class="min-w-0 flex-1">
                <b>Code by email</b> <i class="badge">Recommended</i>
                <span class="choice-sub">Sent to {{ myEmail || 'your email' }} at every login. No phone needed.</span>
              </span>
            </button>

            <button type="button" class="choice" :disabled="busy" @click="beginApp">
              <span class="choice-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />
                </svg>
              </span>
              <span class="min-w-0 flex-1">
                <b>Authenticator app</b>
                <span class="choice-sub">Google or Microsoft Authenticator on a phone, or a browser extension.</span>
              </span>
            </button>
          </div>
          <p v-if="busy" class="mt-3 text-center text-xs text-zinc-500">Starting…</p>
        </template>

        <!-- EMAIL: the code that was sent (to turn it on or off) -->
        <template v-else-if="step === 'email-enable' || step === 'email-disable'">
          <p class="text-sm text-zinc-300">
            <template v-if="sentTo">We sent a 6-digit code to <b class="text-white">{{ sentTo }}</b>.</template>
            <template v-else>Sending a 6-digit code to your email…</template>
            {{ step === 'email-enable' ? 'Enter it to turn on two-step verification.' : 'Enter it to turn two-step verification off.' }}
          </p>
          <p v-if="step === 'email-disable'" class="mt-2 text-xs" :class="status.app ? 'text-zinc-400' : 'text-amber-300'">
            {{ status.app ? 'The authenticator app stays on.' : 'Turning it off makes the Owner account easier to break into.' }}
          </p>

          <input
            ref="codeInput"
            v-model="code"
            class="ts-code mt-4"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="000000"
            aria-label="6-digit code from the email"
            data-free-number
            :disabled="busy"
            @input="onCode(confirmEmail)"
          />
          <p class="mt-2 text-center text-xs text-zinc-500">
            Not there? Check spam.
            <button
              type="button"
              class="font-bold text-red-300 hover:text-white disabled:text-zinc-500"
              :disabled="sending || wait > 0"
              @click="sendCode"
            >
              {{ sending ? 'Sending…' : wait > 0 ? `Resend in ${wait}s` : 'Resend code' }}
            </button>
          </p>

          <div class="mt-4 grid grid-cols-2 gap-2">
            <button type="button" class="ts-secondary" :disabled="busy" @click="step = isOn ? 'on' : 'off'">Back</button>
            <button
              type="button"
              :class="step === 'email-enable' ? 'ts-primary' : 'ts-danger'"
              :disabled="busy || code.length !== 6"
              @click="confirmEmail"
            >
              {{ busy ? 'Checking…' : step === 'email-enable' ? 'Turn on' : 'Turn off' }}
            </button>
          </div>
        </template>

        <!-- APP: scan, then the first code -->
        <template v-else-if="step === 'scan'">
          <p class="text-sm text-zinc-300">Scan this with your authenticator app:</p>
          <div class="mx-auto mt-3 w-48 rounded-2xl bg-white p-3">
            <img :src="setup.qr" alt="QR code for the authenticator app" class="h-full w-full" />
          </div>
          <details class="mt-3 text-center text-xs text-zinc-400">
            <summary class="cursor-pointer font-bold hover:text-white">Can't scan? Type this key instead</summary>
            <p class="mt-2 select-all break-all rounded-lg bg-black/40 p-2 font-mono text-sm text-white">{{ groupedSecret }}</p>
          </details>

          <label class="mt-5 block text-sm font-bold text-zinc-300" for="ts-first">Then enter the 6-digit code from the app</label>
          <input
            id="ts-first"
            ref="codeInput"
            v-model="code"
            class="ts-code mt-2"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="000000"
            data-free-number
            :disabled="busy"
            @input="onCode(confirmApp)"
          />
          <div class="mt-4 grid grid-cols-2 gap-2">
            <button type="button" class="ts-secondary" :disabled="busy" @click="step = isOn ? 'on' : 'off'">Back</button>
            <button type="button" class="ts-primary" :disabled="busy || code.length !== 6" @click="confirmApp">
              {{ busy ? 'Checking…' : 'Turn on' }}
            </button>
          </div>
        </template>

        <!-- RECOVERY CODES: shown once -->
        <template v-else-if="step === 'codes'">
          <p class="rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300">
            Two-step verification is on.
          </p>
          <p class="mt-4 text-sm text-zinc-300">
            <b class="text-white">Save these recovery codes</b> somewhere safe. If you can't get the code
            {{ status.method === 'email' ? '(no access to the email)' : '(lost phone)' }}, one of them lets you in.
            Each works once, and they're shown <b class="text-white">only now</b>.
          </p>
          <ul class="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-black/40 p-3 font-mono text-sm text-white">
            <li v-for="item in codes" :key="item" class="text-center">{{ item }}</li>
          </ul>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <button type="button" class="ts-secondary" @click="copyCodes">{{ copied ? 'Copied ✓' : 'Copy' }}</button>
            <button type="button" class="ts-secondary" @click="downloadCodes">Download .txt</button>
          </div>
          <label class="mt-4 flex items-center gap-2 text-sm text-zinc-300">
            <input v-model="saved" type="checkbox" class="h-4 w-4 accent-red-600" />
            I saved my recovery codes
          </label>
          <button type="button" class="ts-primary mt-4" :disabled="!saved" @click="finish">Done</button>
        </template>

        <!-- ON: each way to get the code, with Add / Turn off; codes left -->
        <template v-else-if="step === 'on'">
          <p class="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300">
            <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true"></span>
            On: every Owner login asks for a 6-digit code{{ status.email && status.app ? ' (from either one below)' : '' }}.
          </p>

          <ul class="mt-4 space-y-2">
            <li class="method">
              <span class="choice-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
                </svg>
              </span>
              <span class="min-w-0 flex-1">
                <b>Code by email</b>
                <span class="choice-sub truncate">{{ status.email ? `On · ${myEmail || 'your email'}` : 'Off' }}</span>
              </span>
              <button v-if="status.email" type="button" class="method-off" :disabled="busy" @click="beginEmailOff">Turn off</button>
              <button v-else type="button" class="method-add" :disabled="busy" @click="beginEmail">Add</button>
            </li>

            <li class="method">
              <span class="choice-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />
                </svg>
              </span>
              <span class="min-w-0 flex-1">
                <b>Authenticator app</b>
                <span class="choice-sub">{{ status.app ? 'On' : 'Off' }}</span>
              </span>
              <button v-if="status.app" type="button" class="method-off" :disabled="busy" @click="beginAppOff">Turn off</button>
              <button v-else type="button" class="method-add" :disabled="busy" @click="beginApp">Add</button>
            </li>
          </ul>

          <p class="mt-4 text-sm text-zinc-300">
            Recovery codes left:
            <b :class="status.codesLeft <= 2 ? 'text-amber-300' : 'text-white'">{{ status.codesLeft }} of 8</b>
          </p>

          <button type="button" class="ts-secondary mt-3" :disabled="busy" @click="makeNewCodes">
            {{ busy ? 'Making…' : 'New recovery codes' }}
          </button>
        </template>

        <!-- APP: turn off with the current code -->
        <template v-else-if="step === 'app-off'">
          <p class="text-sm text-zinc-300">
            {{ status.email ? 'The email code stays on.' : 'Turning it off makes the Owner account easier to break into.' }}
            Enter the current 6-digit code from the app to confirm.
          </p>
          <input
            ref="codeInput"
            v-model="code"
            class="ts-code mt-4"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="000000"
            aria-label="Current 6-digit code"
            data-free-number
            :disabled="busy"
            @input="onCode()"
          />
          <div class="mt-4 grid grid-cols-2 gap-2">
            <button type="button" class="ts-secondary" :disabled="busy" @click="step = 'on'">Cancel</button>
            <button type="button" class="ts-danger" :disabled="busy || code.length !== 6" @click="confirmAppOff">
              {{ busy ? 'Turning off…' : 'Turn off' }}
            </button>
          </div>
        </template>

        <p v-if="error" class="mt-4 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ error }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  finishAppSetup,
  newRecoveryCodes,
  sendEmailCode,
  startAppSetup,
  turnOffApp,
  twoStepState,
  verifyEmailCode,
} from '../lib/twoStep'
import { currentUser } from '../lib/currentUser'
import { toast } from '../lib/toast'

const status = ref({ email: false, app: false, method: 'none', verified: true, codesLeft: 0 })
const loaded = ref(false)
const isOn = computed(() => status.value.email || status.value.app)

// adding the first way makes the recovery codes; a second one keeps them
let firstMethod = false
const myEmail = computed(() => currentUser.value?.email || '')

const open = ref(false)
// off | email-enable | email-disable | scan | codes | on | app-off
const step = ref('off')
const busy = ref(false)
const error = ref('')
const code = ref('')
const codeInput = ref(null)

const setup = ref({ factorId: '', qr: '', secret: '' })
const codes = ref([])
const saved = ref(false)
const copied = ref(false)

// email: where it went, and the wait before another one
const sentTo = ref('')
const sending = ref(false)
const wait = ref(0)
let ticker = null

// "ABCD EFGH IJKL …": easier to type
const groupedSecret = computed(() => (setup.value.secret || '').replace(/(.{4})/g, '$1 ').trim())

async function refresh() {
  try {
    status.value = await twoStepState()
  } catch {
    // keep the last known state
  }
  loaded.value = true
}

async function openWindow() {
  error.value = ''
  code.value = ''
  open.value = true
  await refresh()
  step.value = isOn.value ? 'on' : 'off'
}

function close() {
  if (busy.value) return
  // the codes are shown once: don't lose them by a stray click
  if (step.value === 'codes' && !saved.value) {
    error.value = 'Save your recovery codes first, then tick the box.'
    return
  }
  open.value = false
}

async function focusCode() {
  code.value = ''
  await nextTick()
  codeInput.value?.focus()
}

// digits only; 6 digits can send it
function onCode(send) {
  code.value = code.value.replace(/\D/g, '').slice(0, 6)
  error.value = ''
  if (send && code.value.length === 6) send()
}

function countDown(seconds) {
  wait.value = seconds
  clearInterval(ticker)
  if (seconds <= 0) return
  ticker = setInterval(() => {
    wait.value = Math.max(0, wait.value - 1)
    if (!wait.value) clearInterval(ticker)
  }, 1000)
}

/* ---- email ---- */
async function sendCode() {
  if (sending.value || wait.value > 0) return
  sending.value = true
  error.value = ''
  try {
    const reply = await sendEmailCode(step.value === 'email-enable' ? 'enable' : 'disable')
    sentTo.value = reply?.to || myEmail.value
    countDown(reply?.wait || 60)
  } catch (err) {
    error.value = err.message
    if (err.wait) countDown(err.wait)
  } finally {
    sending.value = false
  }
}

async function beginEmail() {
  firstMethod = !isOn.value
  sentTo.value = ''
  step.value = 'email-enable'
  await focusCode()
  sendCode()
}

async function confirmEmail() {
  if (busy.value || code.value.length !== 6) return
  busy.value = true
  error.value = ''
  const turningOn = step.value === 'email-enable'
  try {
    await verifyEmailCode(turningOn ? 'enable' : 'disable', code.value)
    await refresh()
    if (turningOn) await added('The email code is on.')
    else removed('The email code is off.')
  } catch (err) {
    error.value = err.message
    await focusCode()
  } finally {
    busy.value = false
  }
}

/* ---- authenticator app ---- */
async function beginApp() {
  firstMethod = !isOn.value
  busy.value = true
  error.value = ''
  try {
    setup.value = await startAppSetup()
    step.value = 'scan'
    await focusCode()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

async function confirmApp() {
  if (busy.value || code.value.length !== 6) return
  busy.value = true
  error.value = ''
  try {
    await finishAppSetup(setup.value.factorId, code.value)
    await refresh()
    await added('The authenticator app is on.')
  } catch (err) {
    error.value = err.message
    await focusCode()
  } finally {
    busy.value = false
  }
}

async function confirmAppOff() {
  if (busy.value || code.value.length !== 6) return
  busy.value = true
  error.value = ''
  try {
    await turnOffApp(code.value)
    await refresh()
    removed('The authenticator app is off.')
  } catch (err) {
    error.value = err.message
    await focusCode()
  } finally {
    busy.value = false
  }
}

/* ---- on: add or turn off one way ---- */
// the first way: show the recovery codes; a second one: back to the list
async function added(text) {
  if (firstMethod) {
    codes.value = await newRecoveryCodes()
    saved.value = false
    copied.value = false
    step.value = 'codes'
    await refresh()
  } else {
    step.value = 'on'
    toast(text)
  }
}

// still on with the other way: back to the list; else done
function removed(text) {
  if (isOn.value) {
    step.value = 'on'
    toast(text)
  } else {
    open.value = false
    toast('Two-step verification is off.')
  }
}

async function beginEmailOff() {
  error.value = ''
  sentTo.value = ''
  step.value = 'email-disable'
  await focusCode()
  sendCode()
}

async function beginAppOff() {
  error.value = ''
  step.value = 'app-off'
  await focusCode()
}

async function makeNewCodes() {
  busy.value = true
  error.value = ''
  try {
    codes.value = await newRecoveryCodes()
    saved.value = false
    copied.value = false
    step.value = 'codes'
    await refresh()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

function codesText() {
  return [
    '10 FIVE 7 Hardware: two-step verification recovery codes',
    `Made ${new Date().toLocaleString()}`,
    'Each code works once. Keep them somewhere safe.',
    '',
    ...codes.value,
  ].join('\n')
}

async function copyCodes() {
  try {
    await navigator.clipboard.writeText(codesText())
    copied.value = true
  } catch {
    error.value = "Couldn't copy: select the codes and copy them, or download them."
  }
}

function downloadCodes() {
  const url = URL.createObjectURL(new Blob([codesText()], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = '10-five-7-recovery-codes.txt'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function finish() {
  open.value = false
  toast('Two-step verification is on. The next login asks for the code.')
}

onMounted(refresh)
onBeforeUnmount(() => clearInterval(ticker))
</script>

<style scoped>
.ts-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.75rem;
  border: 1px solid;
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 700;
  transition: background-color 0.15s;
}

.ts-btn.is-on {
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}

.ts-btn.is-on:hover {
  background: rgba(16, 185, 129, 0.1);
}

.ts-btn.is-off {
  border-color: rgba(245, 158, 11, 0.45);
  color: #fcd34d;
}

.ts-btn.is-off:hover {
  background: rgba(245, 158, 11, 0.1);
}

/* the two ways to get the code */
.choice {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  border-radius: 1rem;
  border: 1px solid var(--hairline);
  background: rgba(0, 0, 0, 0.25);
  padding: 0.9rem 1rem;
  text-align: left;
  color: #fff;
  transition: border-color 0.15s, background-color 0.15s;
}

.choice:hover:not(:disabled) {
  border-color: rgba(224, 27, 50, 0.5);
  background: rgba(224, 27, 50, 0.08);
}

.choice:disabled {
  opacity: 0.5;
}

.choice-icon {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  flex: none;
  place-items: center;
  border-radius: 0.7rem;
  background: rgba(224, 27, 50, 0.14);
  color: #fb7185;
}

.choice-icon svg {
  width: 1.15rem;
  height: 1.15rem;
}

.choice b {
  font-size: 0.92rem;
}

.badge {
  margin-left: 0.35rem;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.15);
  padding: 0.1rem 0.45rem;
  font-size: 0.65rem;
  font-style: normal;
  font-weight: 700;
  color: #6ee7b7;
}

/* a way to get the code, in the On list */
.method {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 1rem;
  border: 1px solid var(--hairline);
  background: rgba(0, 0, 0, 0.25);
  padding: 0.75rem 0.9rem;
  color: #fff;
}

.method b {
  font-size: 0.9rem;
}

.method-add,
.method-off {
  flex: none;
  border-radius: 0.6rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 700;
}

.method-add {
  background: var(--brand);
  color: #fff;
}

.method-add:hover:not(:disabled) {
  background: var(--brand-bright);
}

.method-off {
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.method-off:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
  color: #fff;
}

.method-add:disabled,
.method-off:disabled {
  opacity: 0.5;
}

.choice-sub {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.78rem;
  color: var(--color-zinc-400);
}

.ts-code {
  width: 100%;
  border: 1px solid var(--hairline);
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.4);
  padding: 12px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: 0.4em;
  text-indent: 0.4em;
  color: #fff;
  outline: none;
}

.ts-code::placeholder {
  color: #3f3f46;
}

.ts-code:focus {
  border-color: rgba(224, 27, 50, 0.6);
  box-shadow: 0 0 0 3px rgba(224, 27, 50, 0.16);
}

.ts-primary,
.ts-secondary,
.ts-danger {
  width: 100%;
  border-radius: 0.8rem;
  padding: 0.75rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #fff;
}

.ts-primary {
  background: var(--brand);
}

.ts-primary:hover:not(:disabled) {
  background: var(--brand-bright);
}

.ts-secondary {
  background: var(--color-zinc-800);
}

.ts-secondary:hover:not(:disabled) {
  background: var(--color-zinc-700);
}

.ts-danger {
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
}

.ts-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  color: #fff;
}

.ts-primary:disabled,
.ts-secondary:disabled,
.ts-danger:disabled {
  opacity: 0.5;
}
</style>
