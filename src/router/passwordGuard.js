// Vue Router guard: forces employees with a temporary password onto
// /change-password. This is for user experience only — the real protection
// is the database policy (migration) and the Edge Functions.
import { getPasswordStatus, EXPIRED_MESSAGE } from '../lib/passwordStatus'

// Names of routes that anyone may open (adjust to your router).
const PUBLIC_ROUTES = ['login']

export function installPasswordGuard(router, supabase) {
  router.beforeEach(async (to) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return true // your existing auth guard handles logged-out users

    const status = getPasswordStatus(session.user)

    if (status === 'expired') {
      await supabase.auth.signOut()
      return { name: 'login', query: { notice: EXPIRED_MESSAGE } }
    }

    if (status === 'must_change' && to.name !== 'change-password' && !PUBLIC_ROUTES.includes(to.name)) {
      return { name: 'change-password', replace: true }
    }

    if (status === 'ok' && to.name === 'change-password') {
      return { path: '/' } // nothing to change; send them home
    }

    return true
  })
}