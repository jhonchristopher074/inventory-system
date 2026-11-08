<template>
  <!-- The Owner's two-step verification (Profile & Users header): its state
       on the button, and a window to set it up, see recovery codes or turn
       it off (lib/twoStep.js). -->
  <button
    type="button"
    class="ts-btn"
    :class="status.on ? 'is-on' : 'is-off'"
    :title="status.on ? 'Two-step verification is on' : 'Two-step verification is off: set it up'"
    @click="openWindow"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path v-if="status.on" d="M9 12l2 2 4-4" />
    </svg>
    Two-step: {{ loaded ? (status.on ? 'On' : 'Off') : '…' }}
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

        <!-- OFF: what it is -->
        <template v-if="step === 'off'">
          <p class="text-sm text-zinc-300">
            After your password, the Owner account will also ask for a <b class="text-white">6-digit code</b> from an
            authenticator app on your phone. Someone who learns your password still can't get in.
          </p>
          <ol class="mt-4 space-y-2 text-sm text-zinc-400">
            <li><b class="text-white">1.</b> Install <b class="text-zinc-200">Google Authenticator</b> or <b class="text-zinc-200">Microsoft Authenticator</b>.</li>
            <li><b class="text-white">2.</b> Scan the QR code shown next.</li>
            <li><b class="text-white">3.</b> Type the 6-digit code it shows, and save your recovery codes.</li>
          </ol>
          <button type="button" class="ts-primary mt-5" :disabled="busy" @click="beginSetup">
            {{ busy ? 'Starting…' : 'Set up two-step verification' }}
          </button>
        </template>

        <!-- SETUP: scan, then the first code -->
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
            @input="onCode(confirmSetup)"
          />
          <button type="button" class="ts-primary mt-4" :disabled="busy || code.length !== 6" @click="confirmSetup">
            {{ busy ? 'Checking…' : 'Turn on' }}
          </button>
        </template>

        <!-- RECOVERY CODES: shown once -->
        <template v-else-if="step === 'codes'">
          <p class="rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300">
            Two-step verification is on.
          </p>
          <p class="mt-4 text-sm text-zinc-300">
            <b class="text-white">Save these recovery codes</b> somewhere safe (not on the same phone). If you lose your
            phone, one of them lets you in. Each works once, and they're shown <b class="text-white">only now</b>.
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

        <!-- ON: codes left, new codes, turn off -->
        <template v-else-if="step === 'on'">
          <p class="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300">
            <span class="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true"></span>
            On: every Owner login asks for the 6-digit code.
          </p>
          <p class="mt-4 text-sm text-zinc-300">
            Recovery codes left:
            <b :class="status.codesLeft <= 2 ? 'text-amber-300' : 'text-white'">{{ status.codesLeft }} of 8</b>
          </p>

          <div class="mt-5 grid gap-2">
            <button type="button" class="ts-secondary" :disabled="busy" @click="makeNewCodes">
              {{ busy ? 'Making…' : 'New recovery codes' }}
            </button>
            <button type="button" class="ts-danger" :disabled="busy" @click="step = 'off-confirm'">
              Turn off two-step verification
            </button>
          </div>
        </template>

        <!-- TURN OFF: the current code first -->
        <template v-else-if="step === 'off-confirm'">
          <p class="text-sm text-zinc-300">
            Turning it off makes the Owner account easier to break into. Enter the current 6-digit code to confirm.
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
            <button type="button" class="ts-danger" :disabled="busy || code.length !== 6" @click="confirmOff">
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
import { computed, nextTick, onMounted, ref } from 'vue'
import { finishSetup, newRecoveryCodes, startSetup, turnOff, twoStepStatus } from '../lib/twoStep'
import { toast } from '../lib/toast'

const status = ref({ on: false, factorId: null, codesLeft: 0 })
const loaded = ref(false)

const open = ref(false)
const step = ref('off') // off | scan | codes | on | off-confirm
const busy = ref(false)
const error = ref('')
const code = ref('')
const codeInput = ref(null)

const setup = ref({ factorId: '', qr: '', secret: '' })
const codes = ref([])
const saved = ref(false)
const copied = ref(false)

// "ABCD EFGH IJKL …": easier to type
const groupedSecret = computed(() => (setup.value.secret || '').replace(/(.{4})/g, '$1 ').trim())

async function refresh() {
  try {
    status.value = await twoStepStatus()
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
  step.value = status.value.on ? 'on' : 'off'
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

async function beginSetup() {
  busy.value = true
  error.value = ''
  try {
    setup.value = await startSetup()
    step.value = 'scan'
    await focusCode()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

async function confirmSetup() {
  if (busy.value || code.value.length !== 6) return
  busy.value = true
  error.value = ''
  try {
    codes.value = await finishSetup(setup.value.factorId, code.value)
    saved.value = false
    copied.value = false
    step.value = 'codes'
    await refresh()
  } catch (err) {
    error.value = err.message
    await focusCode()
  } finally {
    busy.value = false
  }
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

async function confirmOff() {
  if (busy.value || code.value.length !== 6) return
  busy.value = true
  error.value = ''
  try {
    await turnOff(code.value)
    await refresh()
    open.value = false
    toast('Two-step verification is off.')
  } catch (err) {
    error.value = err.message
    await focusCode()
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
