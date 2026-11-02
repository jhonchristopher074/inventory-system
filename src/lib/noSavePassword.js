/**
 * v-no-save: a password box the browser doesn't offer to save.
 *
 *   <input v-model="password" :type="$passwordType(show)" v-no-save="show" />
 *
 * Browsers offer "Save password?" for every type="password" box and ignore
 * autocomplete="off" there. Accounts aren't kept on the device in this
 * system, so the box is a text box drawn as dots instead (CSS
 * -webkit-text-security): nothing for the browser to save. The value is
 * whether the password is shown (the eye button).
 *
 * Copying or cutting it while it's dots is blocked, like a real password
 * box. A browser that can't draw a text box as dots (older Firefox) keeps
 * the normal password box, so the password is never shown by accident;
 * there the browser may still ask, and "Never" stops it.
 */
const CAN_MASK =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  (CSS.supports('-webkit-text-security', 'disc') || CSS.supports('text-security', 'disc'))

// The box's type. It must never be "password", not even for a moment:
// Chrome and Edge remember a box that was a password box once (for
// show-password buttons) and still offer to save it. So where dots can be
// drawn on a text box, it's always a text box.
export function passwordType(shown) {
  return CAN_MASK || shown ? 'text' : 'password'
}

function blockWhileHidden(event) {
  if (event.target.classList.contains('masked-input')) event.preventDefault()
}

function apply(el, shown) {
  // never suggested, filled in or remembered by the browser or the keyboard
  el.setAttribute('autocomplete', 'off')
  el.setAttribute('autocapitalize', 'off')
  el.setAttribute('autocorrect', 'off')
  el.setAttribute('spellcheck', 'false')

  if (!CAN_MASK) return

  if (el.type !== 'text') el.type = 'text'
  el.classList.toggle('masked-input', !shown)
}

export const vNoSave = {
  // before the box is on the page, so the browser never sees a password box
  beforeMount(el, binding) {
    apply(el, Boolean(binding.value))
  },
  mounted(el, binding) {
    apply(el, Boolean(binding.value))
    el.addEventListener('copy', blockWhileHidden)
    el.addEventListener('cut', blockWhileHidden)
  },
  // after Vue has set :type again (e.g. back to 'password' when hidden)
  updated(el, binding) {
    apply(el, Boolean(binding.value))
  },
  unmounted(el) {
    el.removeEventListener('copy', blockWhileHidden)
    el.removeEventListener('cut', blockWhileHidden)
  },
}
