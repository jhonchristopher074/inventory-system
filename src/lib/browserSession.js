/**
 * Log out when the browser (every tab of the app) was closed.
 *
 * Supabase keeps the login in localStorage, which survives closing the
 * browser. To end it on close, each tab that logged in (or was opened while
 * another logged-in tab was open) keeps a mark in sessionStorage, which the
 * browser deletes when the tab is closed but keeps on a refresh.
 *
 *   - refresh the page            → mark still there → stay logged in
 *   - open a second tab           → it asks the open tabs, one answers → stay logged in
 *   - close every tab, come back  → no mark, nobody answers → logged out
 */

const MARK = 'tabLoggedIn'
const ASK = 'anyone-logged-in?'
const YES = 'yes'
const WAIT_MS = 400 // how long a new tab waits for an answer

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('app-tabs') : null

function hasMark() {
  try {
    return sessionStorage.getItem(MARK) === '1'
  } catch {
    return true // storage blocked: can't tell, so don't log out
  }
}

/** Call right after a successful login in this tab. */
export function markTabLoggedIn() {
  try {
    sessionStorage.setItem(MARK, '1')
  } catch {
    // storage blocked: this rule simply doesn't apply
  }
  answer = Promise.resolve(false)
}

// Open logged-in tabs answer a new tab's question.
channel?.addEventListener('message', (event) => {
  if (event.data === ASK && hasMark()) channel.postMessage(YES)
})

function askOtherTabs() {
  if (!channel) return Promise.resolve(false)

  return new Promise((resolve) => {
    const onMessage = (event) => {
      if (event.data !== YES) return
      done(true)
    }
    const done = (found) => {
      clearTimeout(timer)
      channel.removeEventListener('message', onMessage)
      resolve(found)
    }
    const timer = setTimeout(() => done(false), WAIT_MS)
    channel.addEventListener('message', onMessage)
    channel.postMessage(ASK)
  })
}

let answer = null // asked once per page load

/**
 * true = the browser was closed since the login (no open tab is logged in),
 * so the saved login should be ended.
 */
export function wasBrowserClosed() {
  if (!answer) {
    answer = hasMark()
      ? Promise.resolve(false)
      : askOtherTabs().then((otherTabOpen) => {
          if (otherTabOpen) markTabLoggedIn()
          return !otherTabOpen
        })
  }
  return answer
}

export const CLOSED_MESSAGE = 'You were logged out because the browser was closed. Please log in again.'
