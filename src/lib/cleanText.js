// Text copied from chat apps (Messenger, Viber…) or documents can carry
// characters you can't see: zero-width spaces, left-to-right marks, word
// joiners, a byte-order mark, soft hyphens. In an email or a password they
// made a right one "invalid" or "wrong" with nothing to see on screen (the
// browser said: A part followed by '@' should not contain the symbol '').
// They can't be typed on a keyboard, only pasted, so they're taken out.

// Unicode's "default ignorable" characters: the ones that show nothing
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu

export function withoutInvisible(text) {
  return String(text ?? '').replace(INVISIBLE, '')
}

// Emails (and temporary passwords) never have spaces: a pasted one often
// brings a space or a line break before or after it, so every space goes.
export function withoutSpaces(text) {
  return withoutInvisible(text).replace(/\s+/g, '')
}

export const cleanEmail = withoutSpaces

const CLEANERS = {
  email: withoutSpaces,
  nospaces: withoutSpaces,
  // a space can be part of a password (it counts as its symbol)
  password: withoutInvisible,
  text: withoutInvisible,
}

const cleanerOf = new WeakMap()

/**
 * v-clean: cleans what arrives in a box (typed, pasted, dropped or filled in
 * by the browser) before the page uses it. Goes with v-model:
 *
 *   <input v-model="email" v-clean:email type="email" />
 *   <input v-model="password" v-clean:password type="password" />
 *
 *   email, nospaces   no spaces, nothing invisible
 *   password, text    nothing invisible (also with no argument)
 */
export const vClean = {
  created(el, binding) {
    cleanerOf.set(el, CLEANERS[binding.arg] || withoutInvisible)
    el.addEventListener('input', cleanBox)
  },
  beforeUpdate(el, binding) {
    cleanerOf.set(el, CLEANERS[binding.arg] || withoutInvisible)
  },
  unmounted(el) {
    el.removeEventListener('input', cleanBox)
    cleanerOf.delete(el)
  },
}

function cleanBox(event) {
  const box = event.currentTarget
  // a word still being put together (Chinese, Japanese… keyboards): after
  if (event.isComposing || box.composing) return

  const clean = cleanerOf.get(box)
  const value = box.value
  const cleaned = clean ? clean(value) : value
  if (cleaned === value) return

  // keep the cursor where it was (email boxes can't tell where it is)
  let caret = null
  try {
    if (box.selectionStart != null) caret = clean(value.slice(0, box.selectionStart)).length
  } catch {
    caret = null
  }

  box.value = cleaned

  try {
    if (caret != null) box.setSelectionRange(caret, caret)
  } catch {
    // email boxes have no cursor position to set
  }

  // tell v-model (and anything else listening) about the cleaned value;
  // this event comes back here once and changes nothing more
  box.dispatchEvent(new Event('input', { bubbles: true }))
}
