/**
 * Auto-logout after a period without activity, so a shared counter
 * computer doesn't stay logged in as whoever used it last.
 *
 * The time of the last activity is kept in localStorage, so:
 *   - activity in any open tab counts, and
 *   - it still works after the browser was closed: opening the app the
 *     next morning ends the old session instead of walking straight in.
 *
 * Change IDLE_MINUTES to adjust the limit.
 */

export const IDLE_MINUTES = 120 // 2 hours

// "2 hours" / "90 minutes" / "1 hour"
function describeMinutes(minutes) {
  if (minutes % 60 !== 0) return `${minutes} minutes`
  const hours = minutes / 60
  return hours === 1 ? '1 hour' : `${hours} hours`
}

export const IDLE_MESSAGE = `You were logged out after ${describeMinutes(IDLE_MINUTES)} without activity.`

const KEY = 'lastActivityAt'
const LIMIT_MS = IDLE_MINUTES * 60 * 1000

// how often activity is written, and how often the limit is checked
const WRITE_EVERY_MS = 15 * 1000
const CHECK_EVERY_MS = 30 * 1000

function lastActivity() {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

export function markActivity() {
  try {
    localStorage.setItem(KEY, String(Date.now()))
  } catch {
    // storage disabled: auto-logout simply doesn't apply
  }
}

// No record yet (e.g. the first load after this was added) is not "expired".
export function isIdleExpired() {
  const last = lastActivity()
  return last > 0 && Date.now() - last > LIMIT_MS
}

/**
 * Records activity and calls onExpire once the limit has passed.
 * Returns a function that stops watching.
 */
export function watchIdle(onExpire) {
  let lastWrite = 0

  const onActivity = () => {
    const now = Date.now()
    if (now - lastWrite < WRITE_EVERY_MS) return
    lastWrite = now
    markActivity()
  }

  const check = () => {
    if (isIdleExpired()) onExpire()
  }

  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
  const options = { passive: true, capture: true }

  events.forEach((name) => window.addEventListener(name, onActivity, options))
  // timers are slowed down in background tabs: check again when coming back
  document.addEventListener('visibilitychange', check)
  const timer = setInterval(check, CHECK_EVERY_MS)

  return () => {
    events.forEach((name) => window.removeEventListener(name, onActivity, options))
    document.removeEventListener('visibilitychange', check)
    clearInterval(timer)
  }
}
