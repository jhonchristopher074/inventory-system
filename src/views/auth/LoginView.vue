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
                autocomplete="one-time-code"
                maxlength="10"
                required
                placeholder="••••••"
                @input="resetCode = resetCode.replace(/\D/g, ''); errorMessage = ''"
              />
            </div>

            <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

            <button type="submit" class="submit" :disabled="verifying || resetCode.length < 6">
              {{ verifying ? 'Checking…' : 'Continue' }}
            </button>

            <div class="links-row">
              <button type="button" class="text-link" @click="resetSent = false">← Change email</button>
              <button type="button" class="text-link" :disabled="sendingReset" @click="forgotPassword">
                {{ sendingReset ? 'Sending…' : 'Send a new code' }}
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

            <button type="submit" class="submit" :disabled="sendingReset">
              {{ sendingReset ? 'Sending…' : 'Send code' }}
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
                <input
                  id="login-email"
                  v-model="email"
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

            <div class="field">
              <label for="login-password">Password</label>
              <div class="control">
                <svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <input
                  id="login-password"
                  v-model="password"
                  v-clean:password
                  :type="showPassword ? 'text' : 'password'"
                  required
                  autocomplete="current-password"
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
              <label class="remember">
                <input v-model="rememberEmail" type="checkbox" />
                Remember this email
              </label>
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

.options-row,
.links-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.9rem;
  font-size: 0.875rem;
}

.remember {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #a5a5b2;
  cursor: pointer;
}

.remember input {
  width: 1rem;
  height: 1rem;
  accent-color: #e01b32;
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
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { afterLogin } from '../../lib/passwordStatus'
import { markActivity } from '../../lib/idleLogout'
import { markLoggedIn } from '../../lib/browserSession'
import { startPasswordRecovery } from '../../lib/passwordRecovery'
import { cleanEmail, vClean, withoutInvisible } from '../../lib/cleanText'
import { logoUrl, showDefaultLogo } from '../../lib/storeLogo'
import { saveCurrentUser } from '../../lib/currentUser'

const router = useRouter()
const route = useRoute()

const year = new Date().getFullYear()

// "Remember this email": only the email is kept in this browser, never
// the password
const REMEMBER_KEY = 'rememberedEmail'

function rememberedEmail() {
  try {
    return localStorage.getItem(REMEMBER_KEY) || ''
  } catch {
    return ''
  }
}

const email = ref(rememberedEmail())
const rememberEmail = ref(Boolean(email.value))
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

  try {
    if (rememberEmail.value) localStorage.setItem(REMEMBER_KEY, address)
    else localStorage.removeItem(REMEMBER_KEY)
  } catch {
    // storage blocked: the email just isn't remembered
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

async function forgotPassword() {
  errorMessage.value = ''
  infoMessage.value = ''

  const address = cleanEmail(resetEmail.value)

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