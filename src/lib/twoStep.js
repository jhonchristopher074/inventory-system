// Two-step verification (authenticator app, 6-digit code) with Supabase MFA.
//
//   needsCode()            this login still has to enter the code
//   verifyCode(code)       the code at login → the login is fully verified
//   twoStepStatus()        { on, factorId, codesLeft }
//   startSetup()           { factorId, qr, secret }: scan the QR code
//   finishSetup(id, code)  the first code turns it on → 8 recovery codes
//   newRecoveryCodes()     8 new codes (the old ones stop working)
//   turnOff(code)          the current code, then it's off
//   useRecoveryCode(code)  lost phone: turns it off (supabase/functions/mfa-recovery)
//
// The server checks the same (supabase/migrations/20261117000001): an
// Owner login that skipped the code can't read or change anything.
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
  if (digits.length !== 6) throw new Error('Enter the 6-digit code from your authenticator app.')
  return digits
}

export async function needsCode() {
  if (!mfa()) return false
  const { data, error } = await mfa().getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
}

async function verifiedFactor() {
  const { data, error } = await mfa().listFactors()
  if (error) throw new Error(plain(error, "Couldn't check two-step verification."))
  return (data?.totp || []).find((factor) => factor.status === 'verified') || null
}

export async function verifyCode(code) {
  const digits = sixDigits(code)
  const factor = await verifiedFactor()
  if (!factor) return // turned off meanwhile: nothing to enter
  const { error } = await mfa().challengeAndVerify({ factorId: factor.id, code: digits })
  if (error) throw new Error(plain(error, "Couldn't check the code."))
}

export async function twoStepStatus() {
  if (!mfa()) return { on: false, factorId: null, codesLeft: 0 }
  const factor = await verifiedFactor()
  let codesLeft = 0
  if (factor) {
    const { data } = await supabase.rpc('mfa_recovery_codes_left')
    codesLeft = Number(data) || 0
  }
  return { on: Boolean(factor), factorId: factor?.id || null, codesLeft }
}

export async function startSetup() {
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

export async function finishSetup(factorId, code) {
  const digits = sixDigits(code)
  const { error } = await mfa().challengeAndVerify({ factorId, code: digits })
  if (error) throw new Error(plain(error, "Couldn't check the code."))
  return newRecoveryCodes()
}

export async function turnOff(code) {
  const digits = sixDigits(code)
  const factor = await verifiedFactor()
  if (!factor) return
  const { error: verifyError } = await mfa().challengeAndVerify({ factorId: factor.id, code: digits })
  if (verifyError) throw new Error(plain(verifyError, "Couldn't check the code."))
  const { error } = await mfa().unenroll({ factorId: factor.id })
  if (error) throw new Error(plain(error, "Couldn't turn it off."))
  await supabase.auth.refreshSession()
}

export async function useRecoveryCode(code) {
  const { error } = await supabase.functions.invoke('mfa-recovery', { body: { code } })
  if (error) {
    let message = "Couldn't use the recovery code. Please try again."
    try {
      message = (await error.context.json()).error || message
    } catch {
      // keep the plain message
    }
    throw new Error(message)
  }
  // the account has no authenticator now: a fresh token says so
  await supabase.auth.refreshSession()
}
