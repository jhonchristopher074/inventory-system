<template>
  <!-- Two halves on computers: the store's panel on the left, the form on
       the right. Phones and narrow windows: only the form, with the logo
       above it. -->
  <div class="login-page">
    <!-- LEFT: what this is and whose it is -->
    <section class="brand">
      <div class="wordmark">
        <img :src="logoUrl" alt="" width="52" height="52" class="wordmark-logo" @error="showDefaultLogo" />
        <div class="wordmark-text">10 <span>FIVE</span> 7<small>HARDWARE</small></div>
      </div>

      <div class="pitch">
        <h2>Everything the store runs on, in one place.</h2>
        <p>Stock, sales at the counter, inspections and supplier receipts for the 10 FIVE 7 team.</p>
        <ul class="ticks">
          <li><i aria-hidden="true">✓</i> Live stock with low-stock alerts</li>
          <li><i aria-hidden="true">✓</i> Point of sale and sales history</li>
          <li><i aria-hidden="true">✓</i> Supplier receipts checked before they count</li>
        </ul>
      </div>

      <p class="legal">© {{ year }} 10 FIVE 7 Hardware · For authorized staff only</p>
    </section>

    <!-- RIGHT: the form -->
    <section class="side">
      <div class="form-box">
        <!-- narrow screens: the left panel is hidden, so the logo goes here -->
        <div class="wordmark wordmark-small">
          <img :src="logoUrl" alt="" width="44" height="44" class="wordmark-logo" @error="showDefaultLogo" />
          <div class="wordmark-text">10 <span>FIVE</span> 7<small>HARDWARE</small></div>
        </div>

        <!-- FORGOT PASSWORD, step 2: the 6-digit code from the email -->
        <template v-if="mode === 'forgot' && resetSent">
          <h1 class="title">Enter the code</h1>
          <p class="sub">
            We sent a code to <b>{{ cleanEmail(resetEmail) }}</b>. Enter it below (or use the link in the email).
          </p>

          <form @submit.prevent="verifyCode">
            <div class="field">
              <label for="reset-code">Code</label>
              <input
                id="reset-code"
                ref="resetCodeInput"
                v-model="resetCode"
                class="code-input"
                inputmode="numeric"
                data-free-number
                autocomplete="one-time-code"
                maxlength="6"
                required
                placeholder="••••••"
                @input="resetCode = resetCode.replace(/\D/g, '').slice(0, 6); errorMessage = ''"
              />
            </div>

            <!-- how long the code still works -->
            <p class="timer-line" :class="{ 'is-over': codeLeft === 0 }" role="timer" aria-live="off">
              <template v-if="codeLeft > 0">Code expires in <b>{{ clock(codeLeft) }}</b></template>
              <template v-else>This code has expired. Send a new one.</template>
            </p>

            <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

            <button type="submit" class="submit" :disabled="verifying || resetCode.length !== 6 || codeLeft === 0">
              {{ verifying ? 'Checking…' : 'Continue' }}
            </button>

            <div class="links-row">
              <button type="button" class="text-link" @click="resetSent = false">← Change email</button>
              <button type="button" class="text-link" :disabled="sendingReset || resendLeft > 0" @click="forgotPassword">
                {{ sendingReset ? 'Sending…' : resendLeft > 0 ? `Send a new code in ${resendLeft}s` : 'Send a new code' }}
              </button>
            </div>
          </form>
        </template>

        <!-- FORGOT PASSWORD, step 1: asks only for the email -->
        <template v-else-if="mode === 'forgot'">
          <h1 class="title">Reset your password</h1>
          <p class="sub">Enter the email of your account. We'll send you a code to choose a new password.</p>

          <form @submit.prevent="forgotPassword">
            <div class="field">
              <label for="reset-email">Email</label>
              <div class="control">
                <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                </svg>
                <input
                  maxlength="254"
                  id="reset-email"
                  ref="resetEmailInput"
                  v-model="resetEmail"
                  v-clean:email
                  type="email"
                  required
                  autocomplete="email"
                  autocapitalize="off"
                  spellcheck="false"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

            <button type="submit" class="submit" :disabled="sendingReset || resendLeft > 0">
              {{ sendingReset ? 'Checking…' : resendLeft > 0 ? `Wait ${resendLeft}s to send again` : 'Send code' }}
            </button>

            <button type="button" class="text-link back" @click="showLogin">← Back to login</button>
          </form>
        </template>

        <!-- LOGIN -->
        <template v-else>
          <h1 class="title">Welcome back</h1>
          <p class="sub">Log in to your account.</p>

          <form @submit.prevent="login">
            <div class="field">
              <label for="login-email">Email</label>
              <div class="control">
                <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
                </svg>
                <!-- v-clean: a pasted email (e.g. from Messenger) loses the
                     invisible characters and spaces it brought along -->
                <!-- autocomplete off: the browser isn't asked to fill in or keep
                     the account (some browsers may still offer it) -->
                <input
                  maxlength="254"
                  id="login-email"
                  v-model="email"
                  v-clean:email
                  type="email"
                  required
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div class="field">
              <label for="login-password">Password</label>
              <div class="control">
                <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <input
                  maxlength="72"
                  id="login-password"
                  v-model="password"
                  v-clean:password
                  :type="$passwordType(showPassword)" v-no-save="showPassword"
                  required
                  autocomplete="off"
                  placeholder="Your password"
                />
                <button
                  type="button"
                  class="eye"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  :title="showPassword ? 'Hide password' : 'Show password'"
                  @click="showPassword = !showPassword"
                >
                  <svg v-if="!showPassword" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="options-row">
              <button type="button" class="text-link accent" @click="showForgot">Forgot password?</button>
            </div>

            <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

            <button type="submit" class="submit" :disabled="loading">
              {{ loading ? 'Logging in…' : 'Log in' }}
            </button>

            <p class="secure">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" />
              </svg>
              Secure login · your password is never shown to anyone
            </p>
            <p class="help">Can't log in? Ask the store owner to reset your account.</p>
          </form>

          <!-- GUEST: look around on sample data, view only (lib/guestMode.js) -->
          <div class="guest">
            <div class="guest-or"><span>or</span></div>

            <button
              v-if="!guestOpen"
              type="button"
              class="guest-btn"
              @click="guestOpen = true"
            >
              Continue as guest
              <span class="guest-btn-sub">View only · sample data</span>
            </button>

            <div v-else class="guest-pick" role="group" aria-label="Look around as">
              <p class="guest-title">Look around as…</p>
              <div class="guest-roles">
                <button
                  v-for="option in GUEST_ROLES"
                  :key="option.role"
                  type="button"
                  class="guest-role"
                  @click="enterAsGuest(option.role)"
                >
                  <b>{{ option.label }}</b>
                  <span>{{ option.hint }}</span>
                </button>
              </div>
              <p class="guest-note">Nothing you do as a guest is saved, and no real store data is shown.</p>
              <button type="button" class="text-link back" @click="guestOpen = false">← Back</button>
            </div>
          </div>
        </template>
      </div>
    </section>

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

/* ---------------- the two halves ---------------- */
.login-page {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0c;
  color: #ececf1;
}

/* LEFT: crimson panel with a faint grid */
.brand {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 2rem;
  padding: 3rem clamp(2rem, 5vw, 4.5rem);
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(244, 52, 76, 0.45), transparent 55%),
    radial-gradient(90% 80% at 100% 100%, rgba(224, 27, 50, 0.25), transparent 60%),
    linear-gradient(160deg, #2a0a10, #0d0d10 70%);
}

.brand::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 36px 36px;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent);
}

.brand > * {
  position: relative;
  z-index: 1;
}

.wordmark {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.wordmark-logo {
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 0.75rem;
  object-fit: contain;
  filter: drop-shadow(0 6px 14px rgba(224, 27, 50, 0.4));
}

.wordmark-text {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
  color: #fff;
}

.wordmark-text span {
  color: #f4344c;
}

.wordmark-text small {
  display: block;
  margin-top: 0.4rem;
  font-size: 0.68rem;
  letter-spacing: 0.3em;
  color: #d2d2db;
}

.pitch {
  max-width: 30rem;
}

.pitch h2 {
  margin: 0 0 0.85rem;
  font-size: clamp(1.9rem, 3.2vw, 2.6rem);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: #fff;
}

.pitch p {
  margin: 0 0 1.4rem;
  font-size: 1.05rem;
  line-height: 1.5;
  color: #c9c9d3;
}

.ticks {
  display: grid;
  gap: 0.65rem;
  font-size: 1rem;
  color: #e6e6ec;
}

.ticks li {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.ticks i {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.18);
  color: #34d399;
  font-size: 0.8rem;
  font-style: normal;
  font-weight: 800;
}

.legal {
  font-size: 0.85rem;
  color: #8b8b97;
}

/* RIGHT: the form */
.side {
  display: grid;
  place-items: center;
  padding: 2.5rem 1.5rem;
}

.form-box {
  width: 100%;
  max-width: 26rem;
}

.wordmark-small {
  display: none;
  margin-bottom: 2rem;
}

.title {
  font-size: 1.9rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #fff;
}

.sub {
  margin: 0.35rem 0 0.4rem;
  font-size: 1rem;
  color: #a5a5b2;
}

.sub b {
  color: #fff;
}

.field {
  display: grid;
  gap: 0.45rem;
  margin-top: 1.1rem;
}

.field label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #ececf1;
}

.control {
  position: relative;
  display: flex;
  align-items: center;
}

.control-icon {
  position: absolute;
  left: 0.9rem;
  width: 1.15rem;
  height: 1.15rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: #8b8b97;
  pointer-events: none;
}

.control input,
.code-input {
  width: 100%;
  border-radius: 0.85rem;
  border: 1px solid #2a2a32;
  background: #151519;
  color: #fff;
  font-size: 1rem;
  outline: none;
}

.control input {
  padding: 0.85rem 3rem 0.85rem 2.75rem;
}

.control input::placeholder,
.code-input::placeholder {
  color: #6c6c79;
}

.control input:focus,
.code-input:focus {
  border-color: #f4344c;
  box-shadow: 0 0 0 3px rgba(224, 27, 50, 0.18);
}

.code-input {
  padding: 0.85rem 1rem;
  text-align: center;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: 0.5em;
}

/* "Code expires in 59:41", under the code box */
.timer-line {
  margin: 0.6rem 0 1.1rem;
  text-align: center;
  font-size: 0.82rem;
  color: #9a9aa6;
  font-variant-numeric: tabular-nums;
}

.timer-line b {
  color: #fff;
}

.timer-line.is-over {
  color: #f87171;
}

.eye {
  position: absolute;
  right: 0.45rem;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.6rem;
  color: #a5a5b2;
}

.eye:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.eye svg,
.secure svg {
  width: 1.15rem;
  height: 1.15rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.options-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.9rem;
  font-size: 0.875rem;
}

.links-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.9rem;
  font-size: 0.875rem;
}

.text-link {
  font-weight: 700;
  color: #a5a5b2;
}

.text-link:hover {
  color: #ff6b7d;
}

.text-link:disabled {
  opacity: 0.5;
}

.text-link.accent {
  color: #ff6b7d;
}

.text-link.accent:hover {
  color: #fff;
}

.text-link.back {
  display: block;
  width: 100%;
  margin-top: 1rem;
  text-align: center;
}

.error {
  margin-top: 1rem;
  border-radius: 0.75rem;
  background: rgba(224, 27, 50, 0.12);
  padding: 0.75rem;
  font-size: 0.875rem;
  color: #ff6b7d;
}

.submit {
  width: 100%;
  margin-top: 1.25rem;
  border-radius: 0.85rem;
  background: #e01b32;
  padding: 0.9rem;
  font-size: 1rem;
  font-weight: 800;
  color: #fff;
  box-shadow: 0 10px 24px -10px rgba(224, 27, 50, 0.8);
}

.submit:not(:disabled):hover {
  background: #f4344c;
}

.submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.secure {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 1.1rem;
  font-size: 0.82rem;
  color: #a5a5b2;
}

/* ---- guest mode ---- */
.guest {
  margin-top: 1.4rem;
}

.guest-or {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6c6c79;
}

.guest-or::before,
.guest-or::after {
  content: '';
  height: 1px;
  flex: 1;
  background: #2a2a32;
}

.guest-btn {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  border-radius: 0.85rem;
  border: 1px dashed #3a3a44;
  background: transparent;
  padding: 0.8rem 1rem;
  font-weight: 800;
  color: #e6e6ec;
  transition: border-color 0.15s, background-color 0.15s;
}

.guest-btn:hover,
.guest-btn:focus-visible {
  outline: none;
  border-color: #f4344c;
  background: rgba(224, 27, 50, 0.06);
}

.guest-btn-sub {
  font-size: 0.75rem;
  font-weight: 600;
  color: #8b8b97;
}

.guest-title {
  margin-bottom: 0.6rem;
  font-weight: 800;
  color: #fff;
}

.guest-roles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.guest-role {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border-radius: 0.8rem;
  border: 1px solid #2a2a32;
  background: #151519;
  padding: 0.7rem 0.8rem;
  text-align: left;
  color: #fff;
  transition: border-color 0.15s, transform 0.15s;
}

.guest-role span {
  font-size: 0.72rem;
  line-height: 1.3;
  color: #8b8b97;
}

.guest-role:hover,
.guest-role:focus-visible {
  outline: none;
  border-color: #f4344c;
  transform: translateY(-1px);
}

.guest-note {
  margin-top: 0.7rem;
  font-size: 0.75rem;
  color: #8b8b97;
}

.help {
  margin-top: 0.4rem;
  text-align: center;
  font-size: 0.82rem;
  color: #a5a5b2;
}

/* narrow windows and phones: only the form */
@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand {
    display: none;
  }

  .wordmark-small {
    display: flex;
  }
}
</style>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { afterLogin } from '../../lib/passwordStatus'
import { markActivity } from '../../lib/idleLogout'
import { markLoggedIn } from '../../lib/browserSession'
import { startPasswordRecovery } from '../../lib/passwordRecovery'
import { cleanEmail, vClean, withoutInvisible } from '../../lib/cleanText'
import { logoUrl, showDefaultLogo } from '../../lib/storeLogo'
import { saveCurrentUser } from '../../lib/currentUser'
import { GUEST_ROLES, startGuest } from '../../lib/guestMode'

const router = useRouter()
const route = useRoute()

const year = new Date().getFullYear()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
// shows e.g. "Your temporary password has expired..." after being sent back here
const errorMessage = ref(route.query.notice ? String(route.query.notice) : '')

// guest mode: pick a role, then the app opens on sample data
const guestOpen = ref(false)

function enterAsGuest(role) {
  startGuest(role, () => {
    // the same "logged in" marks a real login sets (auto-logout rules)
    markLoggedIn()
    markActivity()
  })
}
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
  resetEmail.value = cleanEmail(email.value) // keep what was already typed
  resetSent.value = false
  errorMessage.value = ''
  nextTick(() => resetEmailInput.value?.focus())
}

// The toast (if any) stays until it hides itself.
function showLogin() {
  mode.value = 'login'
  if (cleanEmail(resetEmail.value)) email.value = cleanEmail(resetEmail.value)
  errorMessage.value = ''
}

// Supabase's answer to a wrong email or password
function isWrongLogin(error) {
  return error?.code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message || '')
}

async function login() {
  loading.value = true
  errorMessage.value = ''
  infoMessage.value = ''

  // what's in the boxes, without anything invisible a paste brought along
  const address = cleanEmail(email.value)
  const typed = withoutInvisible(password.value)

  let { data, error } = await supabase.auth.signInWithPassword({ email: address, password: typed })

  // Pasted with a space before or after it? (Copying a word on Windows takes
  // the space after it too.) The password exactly as typed goes first,
  // because a space can be part of one; only if that's wrong, without them.
  if (error && isWrongLogin(error) && typed.trim() && typed.trim() !== typed) {
    const retry = await supabase.auth.signInWithPassword({ email: address, password: typed.trim() })
    if (!retry.error) ({ data, error } = retry)
  }

  if (error) {
    errorMessage.value = isWrongLogin(error) ? 'Wrong email or password. Check them and try again.' : error.message
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

  saveCurrentUser(profile)

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

/* ---- Forgot password timers: one second at a time ---- */
const RESEND_SECONDS = 60 // Supabase lets the same email get a new code after 60 s
const CODE_SECONDS = 60 * 60 // a reset code works for 1 hour (Supabase > Auth > Email OTP expiry)
const now = ref(Date.now())
let ticker = null
const resendAt = ref(0)
const codeUntil = ref(0)

const resendLeft = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))
const codeLeft = computed(() => Math.max(0, Math.ceil((codeUntil.value - now.value) / 1000)))

function startTicker() {
  if (ticker) return
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

onBeforeUnmount(() => clearInterval(ticker))

function clock(seconds) {
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

// "For security purposes, you can only request this after 53 seconds."
function waitSecondsOf(error) {
  const match = /after (\d+) seconds?/i.exec(error?.message || '')
  return match ? Number(match[1]) : 0
}

async function forgotPassword() {
  errorMessage.value = ''
  infoMessage.value = ''

  const address = cleanEmail(resetEmail.value)

  if (!address) {
    errorMessage.value = 'Enter your email.'
    return
  }
  // any provider (gmail, proton, school emails...): only the shape is checked
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    errorMessage.value = 'That doesn\'t look like an email address.'
    return
  }

  sendingReset.value = true
  startTicker()

  // is it an account? (20261111000001; until that's run, no check)
  const { data: exists, error: checkError } = await supabase.rpc('reset_email_exists', { p_email: address })
  if (!checkError && exists === false) {
    sendingReset.value = false
    errorMessage.value = 'No account uses this email. Check the spelling, or ask the store owner.'
    return
  }

  // The email's link opens /reset-password on this same site. That address
  // must be listed under Supabase > Authentication > URL Configuration.
  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  sendingReset.value = false

  if (error) {
    const wait = waitSecondsOf(error)
    if (wait > 0) {
      // too soon: count down instead of the long message
      resendAt.value = Date.now() + wait * 1000
      now.value = Date.now()
      errorMessage.value = ''
      return
    }
    errorMessage.value = /rate limit/i.test(error.message)
      ? 'Too many reset emails were sent. Wait a while and try again.'
      : error.message
    return
  }

  resetSent.value = true
  resetCode.value = ''
  now.value = Date.now()
  resendAt.value = now.value + RESEND_SECONDS * 1000
  codeUntil.value = now.value + CODE_SECONDS * 1000
  nextTick(() => resetCodeInput.value?.focus())

  infoMessage.value = `A code was sent to ${address}. Check the inbox (and the spam folder).`
}

// The code from the email logs in just for the reset, then the Reset
// password page asks for the new password (same as opening the link).
async function verifyCode() {
  errorMessage.value = ''
  verifying.value = true

  const { error } = await supabase.auth.verifyOtp({
    email: cleanEmail(resetEmail.value),
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