/**
 * Lets a page ask "are you sure?" before Logout signs out.
 *
 * The Approval page sends approved receipts one at a time while it is open.
 * Leaving it stops them, so it asks first: for normal page changes through
 * its own onBeforeRouteLeave, and for Logout through this (Logout signs out
 * before changing page, so the page couldn't ask in time otherwise).
 */

let question = null

// question: async () => true (fine to leave) / false (stay).
// Returns a function that removes it again.
export function setLeaveQuestion(fn) {
  question = fn

  return () => {
    if (question === fn) question = null
  }
}

export async function confirmLeave() {
  return question ? question() : true
}
