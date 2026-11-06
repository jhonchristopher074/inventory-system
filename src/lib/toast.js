// Short "done" messages that pop up at the top and go away by themselves
// (components/ToastHost.vue shows them), instead of piling up in a page.
//   toast('Sent "x.jpg" to the receipt scanner.')
//   toast('Could not save.', { kind: 'error', ms: 10000 })
import { reactive } from 'vue'

export const toasts = reactive([]) // { id, text, kind: 'ok' | 'error' }

let lastId = 0

export function toast(text, { kind = 'ok', ms = 5000 } = {}) {
  if (!text) return null
  const id = ++lastId
  toasts.push({ id, text: String(text), kind })
  // at most 3 on screen: the oldest goes first
  while (toasts.length > 3) toasts.shift()
  if (ms > 0) setTimeout(() => dismissToast(id), ms)
  return id
}

export function dismissToast(id) {
  const index = toasts.findIndex((item) => item.id === id)
  if (index >= 0) toasts.splice(index, 1)
}
