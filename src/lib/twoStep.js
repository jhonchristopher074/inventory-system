// Two-step verification: after the password, a 6-digit code by email (the
// Owner's default) or from an authenticator app.
//
//   twoStepState()               { method: 'none' | 'email' | 'app', verified, codesLeft }
//   needsCode()                  this login still has to enter a code
//   sendEmailCode(purpose)       { to, wait }: emails a code ('login' | 'enable' | 'disable')
//   verifyEmailCode(purpose, c)  checks it (supabase/functions/email-2fa)
//   verifyAppCode(code)          the authenticator code at login
//   startAppSetup() / finishAppSetup(id, code) / turnOffApp(code)
//   newRecoveryCodes()           8 new codes (the old ones stop working)
//   useRecoveryCode(code)        lost phone / email: turns it off (mfa-recovery)
//
// The server checks the same (supabase/migrations/20261117000001): a login
// that skipped the code can't read or change anything.
import { supabase } from './supabase'

const ISSUER = '10 FIVE 7 Hardware'

// guest mode's sample client has no MFA
const mfa = () => supabase.auth.mfa

// the message of a failed call, in plain words
function plain(error, fallback) {
  const text = String(error?.message || '')
  if (/invalid.*(totp|code)|code.*(invalid|incorrect)|challenge/i.test(text)) return 'That code is not right. Check the app and try again.'
  if (/expired/i.test(text)) return 'That code expired. Enter the new one from the app.'
  if (/rate|too many/i.test(text)) return 'Too many tries. Wait a minute, then try again.'
  return text || fallback
}

function sixDigits(code) {
  const digits = String(code || '').replace(/\D/g, '')
  if (digits.length !== 6) throw new Error('Enter the 6-digit code.')
  return digits
}

// an Edge Function's own error message
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = 'Something went wrong. Please try again.'
    let wait = 0
    try {
      const reply = await error.context.json()
      message = reply.error || message
      wait = Number(reply.wait) || 0
    } catch {
      // keep the plain message
    }
    const failure = new Error(message)
    failure.wait = wait
    throw failure
  }
  return data
}

/* ---------------- the state ---------------- */
// the session of this login (a verified one is remembered: no check per page)
let verifiedSession = ''

async function sessionId() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token || ''
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))).session_id || ''
  } catch {
    return ''
  }
}

export async function twoStepState() {
  if (!mfa()) return { method: 'none', verified: true, codesLeft: 0 }

  const { data, error } = await supabase.rpc('get_two_step_state')
  if (!error && data) {
    return { method: data.method || 'none', verified: Boolean(data.verified), codesLeft: Number(data.codes_left) || 0 }
  }

  // before the SQL is run: only the authenticator app (Supabase's own)
  const { data: level } = await mfa().getAuthenticatorAssuranceLevel()
  const app = level?.nextLevel === 'aal2'
  return { method: app ? 'app' : 'none', verified: !app || level.currentLevel === 'aal2', codesLeft: 0 }
}

export async function needsCode() {
  if (!mfa()) return false
  const id = await sessionId()
  if (id && id === verifiedSession) return false

  const state = await twoStepState()
  if (state.verified && id) verifiedSession = id
  return !state.verified
}

/* ---------------- email ---------------- */
export async function sendEmailCode(purpose = 'login') {
  return invoke('email-2fa', { action: 'send', purpose })
}

export async function verifyEmailCode(purpose, code) {
  await invoke('email-2fa', { action: 'verify', purpose, code: sixDigits(code) })
}

/* ---------------- authenticator app ---------------- */
async function verifiedFactor() {
  const { data, error } = await mfa().listFactors()
  if (error) throw new Error(plain(error, "Couldn't check two-step verification."))
  return (data?.totp || []).find((factor) => factor.status === 'verified') || null
}

export async function verifyAppCode(code) {
  const digits = sixDigits(code)
  const factor = await verifiedFactor()
  if (!factor) return // turned off meanwhile: nothing to enter
  const { error } = await mfa().challengeAndVerify({ factorId: factor.id, code: digits })
  if (error) throw new Error(plain(error, "Couldn't check the code."))
}

export async function startAppSetup() {
  // a setup that was started and never finished blocks a new one
  const { data: list } = await mfa().listFactors()
  for (const factor of list?.all || []) {
    if (factor.factor_type === 'totp' && factor.status !== 'verified') {
      await mfa().unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await mfa().enroll({
    factorType: 'totp',
    issuer: ISSUER,
    friendlyName: `${ISSUER} ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error) throw new Error(plain(error, "Couldn't start the setup."))
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

export async function finishAppSetup(factorId, code) {
  const digits = sixDigits(code)
  const { error } = await mfa().challengeAndVerify({ factorId, code: digits })
  if (error) throw new Error(plain(error, "Couldn't check the code."))
  return newRecoveryCodes()
}

export async function turnOffApp(code) {
  const digits = sixDigits(code)
  const factor = await verifiedFactor()
  if (!factor) return
  const { error: verifyError } = await mfa().challengeAndVerify({ factorId: factor.id, code: digits })
  if (verifyError) throw new Error(plain(verifyError, "Couldn't check the code."))
  const { error } = await mfa().unenroll({ factorId: factor.id })
  if (error) throw new Error(plain(error, "Couldn't turn it off."))
  await supabase.auth.refreshSession()
}

/* ---------------- recovery codes ---------------- */
export async function newRecoveryCodes() {
  const { data, error } = await supabase.rpc('owner_new_recovery_codes')
  if (error) {
    throw new Error(
      /owner_new_recovery_codes|schema cache/i.test(error.message)
        ? 'Two-step verification needs an update: run 20261117000001_owner_two_step.sql first.'
        : error.message
    )
  }
  return data || []
}

export async function useRecoveryCode(code) {
  await invoke('mfa-recovery', { code })
  verifiedSession = ''
  // the account has no authenticator now: a fresh token says so
  await supabase.auth.refreshSession()
}
