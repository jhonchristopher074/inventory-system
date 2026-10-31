// Turns off the usual ways into the browser's developer tools ("Inspect")
// on every page of the live site, for every role:
//   - the right-click menu (it has "Inspect" in it)
//   - F12, Ctrl+Shift+I / J / C / K, and Ctrl+U (view the page's source)
//   - on a Mac: Cmd+Option+I / J / C / K / U
//
// On a computer the right-click menu is off everywhere, text boxes too:
// their menu has "Inspect" as well. Paste still works with Ctrl+V. Phones
// and tablets keep their long-press menu (copy, paste); they have no Inspect.
//
// This stops ordinary users, not a determined one: the browser's own menu
// (⋮ > More tools > Developer tools) can't be blocked by a website. So it
// protects nothing by itself. The real protection is the database: every
// change is checked there (who is logged in, their role), whatever the page
// sends, so editing a page in Inspect only changes that one screen.
//
// Started once in main.js, for the built site only (npm run build): when
// running it on your computer (npm run dev) the tools stay usable.

const DEVTOOLS_LETTERS = ['i', 'j', 'c', 'k']

// the letter of the key, also with Shift held or on another keyboard layout
function letterOf(event) {
  if (/^Key[A-Z]$/.test(event.code || '')) return event.code.slice(3).toLowerCase()
  return String(event.key || '').toLowerCase()
}

export function isDevtoolsShortcut(event) {
  if (event.key === 'F12' || event.code === 'F12') return true

  const letter = letterOf(event)
  // Windows / Linux: Ctrl+Shift+…   Mac: Cmd+Option+…
  const pcCombo = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
  const macCombo = event.metaKey && event.altKey

  if ((pcCombo || macCombo) && DEVTOOLS_LETTERS.includes(letter)) return true

  // view the page's source: Ctrl+U, Cmd+Option+U
  const viewSource = (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) || macCombo
  return viewSource && letter === 'u'
}

// a finger or a pen (a phone or tablet), not a mouse
function isTouchMenu(event) {
  if (event.pointerType) return event.pointerType !== 'mouse'
  // browsers that don't say: the device's main pointer
  return window.matchMedia?.('(pointer: coarse)').matches === true
}

function onKeyDown(event) {
  if (!isDevtoolsShortcut(event)) return
  event.preventDefault()
  event.stopImmediatePropagation()
}

function onContextMenu(event) {
  if (isTouchMenu(event)) return
  event.preventDefault()
}

/**
 * Starts the blocking; returns a function that stops it (for tests).
 * Listens first (capture), before anything on the page can see the keys.
 */
export function blockInspect(target = window) {
  target.addEventListener('keydown', onKeyDown, { capture: true })
  target.addEventListener('contextmenu', onContextMenu, { capture: true })

  return () => {
    target.removeEventListener('keydown', onKeyDown, { capture: true })
    target.removeEventListener('contextmenu', onContextMenu, { capture: true })
  }
}
