// Every number box in the app (type="number", or a text box with
// inputmode="numeric" / "decimal") keeps to a sane value as it's typed:
//   - only digits (and one "." when decimals are allowed)
//   - no leading zeros ("0007" -> "7")
//   - at most `max` (its max attribute, else 1,000,000 for counts and
//     9,999,999 for amounts)
//   - at most 2 decimals (or what its step allows)
//   - no "e", "+" or "-" (a minus only where min is below 0)
//
// It runs before the page reads the box (capture phase), so v-model gets
// the cleaned value. A box can opt out with data-free-number.
//
//   import { guardNumbers } from './lib/numberGuard'
//   guardNumbers()

const COUNT_MAX = 1_000_000
const AMOUNT_MAX = 9_999_999

function isNumberBox(el) {
  if (!(el instanceof HTMLInputElement) || el.dataset.freeNumber !== undefined) return false
  if (el.type === 'number') return true
  return el.type === 'text' && (el.inputMode === 'numeric' || el.inputMode === 'decimal')
}

// how many decimals the box takes: 0 for counts ("step=1", numeric)
function decimalsOf(el) {
  if (el.inputMode === 'numeric') return 0
  if (el.inputMode === 'decimal') return 2
  const step = el.getAttribute('step')
  if (step === 'any') return 2
  if (!step) return 0 // type=number with no step only takes whole numbers
  const [, frac = ''] = step.split('.')
  return frac.length
}

function maxOf(el, decimals) {
  const max = Number(el.getAttribute('max'))
  if (el.hasAttribute('max') && Number.isFinite(max)) return max
  return decimals > 0 ? AMOUNT_MAX : COUNT_MAX
}

function allowsNegative(el) {
  const min = el.getAttribute('min')
  return min !== null && Number(min) < 0
}

function clean(el) {
  const raw = el.value
  if (raw === '') return raw

  const decimals = decimalsOf(el)
  const negative = allowsNegative(el) && raw.trim().startsWith('-')

  let text = raw.replace(decimals > 0 ? /[^\d.]/g : /\D/g, '')
  if (decimals > 0) {
    const dot = text.indexOf('.')
    if (dot !== -1) {
      text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, '').slice(0, decimals)
    }
  }
  // "0007" -> "7", but keep "0" and "0.5"
  text = text.replace(/^0+(?=\d)/, '')

  const max = maxOf(el, decimals)
  if (text !== '' && text !== '.' && Number(text) > max) text = String(max)

  return (negative ? '-' : '') + text
}

function onInput(event) {
  const el = event.target
  if (!isNumberBox(el)) return
  const fixed = clean(el)
  if (fixed !== el.value) el.value = fixed
}

// type=number boxes accept "e", "+", "-" and "." on their own: stop them here
function onKeydown(event) {
  const el = event.target
  if (!isNumberBox(el) || event.ctrlKey || event.metaKey || event.altKey) return
  const key = event.key
  if (key === 'e' || key === 'E' || key === '+') event.preventDefault()
  else if (key === '-' && !allowsNegative(el)) event.preventDefault()
  else if ((key === '.' || key === ',') && decimalsOf(el) === 0) event.preventDefault()
}

// a mouse wheel over a focused number box would change it by accident
function onWheel(event) {
  const el = event.target
  if (el instanceof HTMLInputElement && el.type === 'number' && document.activeElement === el) el.blur()
}

export function guardNumbers() {
  document.addEventListener('input', onInput, true)
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('wheel', onWheel, { capture: true, passive: true })
}
