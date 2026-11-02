<template>
  <!-- Staff: count what arrived from one supplier receipt, then "Mark as
       delivered". The owner reviews it and adds it to stock. Each product
       starts at the receipt's number; lower it for what's missing or damaged
       and say why. No prices are shown to staff. -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rc-title"
      @click.self="!busy && emit('close')"
      @keydown.esc="!busy && emit('close')"
    >
      <form class="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-violet-500/30 bg-zinc-900 shadow-2xl" @submit.prevent="submit">
        <header class="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div class="min-w-0">
            <p class="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-300">Receive the delivery</p>
            <h2 id="rc-title" class="mt-1 truncate text-lg font-bold text-white" :title="delivery.file_name">{{ delivery.file_name || 'Delivery' }}</h2>
            <p class="text-xs text-zinc-400">
              <template v-if="delivery.supplier_name">From {{ delivery.supplier_name }} · </template>{{ count(delivery.items.length) }} products · {{ count(expectedPieces) }} pcs
            </p>
          </div>
          <button type="button" class="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-700" :disabled="busy" @click="emit('close')">
            Close
          </button>
        </header>

        <p v-if="delivery.note" class="mx-5 mt-3 rounded-xl bg-sky-500/10 p-3 text-sm text-sky-200">
          <b>From the owner:</b> {{ delivery.note }}
        </p>

        <div class="flex flex-wrap items-center justify-between gap-2 px-5 pt-3">
          <p class="text-sm text-zinc-400">Count each product. Lower the number for what's missing or damaged.</p>
          <button type="button" class="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10" :disabled="busy" @click="fillAll">
            Everything arrived
          </button>
        </div>

        <ul class="mt-2 min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto px-5">
          <li v-for="item in delivery.items" :key="item.id" class="py-3">
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-white" :title="item.product_name">{{ item.product_name }}</p>
                <p class="text-xs text-zinc-500">On the receipt: <b class="text-zinc-300">{{ count(item.expected_qty) }}</b></p>
              </div>
              <label class="sr-only" :for="'rc-qty-' + item.id">Received {{ item.product_name }}</label>
              <div class="flex shrink-0 items-center gap-1">
                <button type="button" class="qty-btn" :disabled="busy || qty[item.id] <= 0" :aria-label="'One less ' + item.product_name" @click="step(item, -1)">−</button>
                <input
                  :id="'rc-qty-' + item.id"
                  v-model.number="qty[item.id]"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  :max="item.expected_qty"
                  class="w-16 rounded-lg border bg-black px-2 py-1.5 text-center text-sm font-bold text-white outline-none focus:border-violet-400"
                  :class="isShort(item) ? 'border-amber-500/60' : 'border-white/10'"
                  :disabled="busy"
                />
                <button type="button" class="qty-btn" :disabled="busy || qty[item.id] >= item.expected_qty" :aria-label="'One more ' + item.product_name" @click="step(item, 1)">+</button>
              </div>
            </div>
            <!-- short: say why -->
            <input
              v-if="isShort(item)"
              v-model="notes[item.id]"
              type="text"
              maxlength="160"
              autocomplete="off"
              :aria-label="'Why ' + item.product_name + ' is short'"
              :placeholder="`${count(item.expected_qty - (Number(qty[item.id]) || 0))} short: missing, damaged…?`"
              class="mt-2 w-full rounded-lg border border-amber-500/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              :disabled="busy"
            />
          </li>
        </ul>

        <div class="border-t border-white/5 px-5 py-3">
          <label class="text-xs text-zinc-500" for="rc-note">Note for the owner (optional)</label>
          <input
            id="rc-note"
            v-model="note"
            type="text"
            maxlength="200"
            autocomplete="off"
            placeholder="e.g. box 2 was wet"
            class="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
            :disabled="busy"
          />
        </div>

        <footer class="flex flex-col gap-3 border-t border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm" :class="message ? 'font-bold text-red-400' : 'text-zinc-400'" :role="message ? 'alert' : null">
            <template v-if="message">{{ message }}</template>
            <template v-else>
              <b class="text-white">{{ count(receivedPieces) }}</b> of {{ count(expectedPieces) }} pcs arrived<template v-if="shortCount">, {{ count(shortCount) }} {{ shortCount === 1 ? 'product' : 'products' }} short</template>.
            </template>
          </p>
          <button type="submit" class="rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-500 disabled:opacity-50" :disabled="busy">
            {{ busy ? 'Saving…' : 'Mark as delivered' }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { count } from '../lib/format'
import { piecesOf } from '../lib/receiving'

const props = defineProps({
  delivery: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['confirm', 'close'])

// each product starts at what the receipt says
const qty = reactive(Object.fromEntries(props.delivery.items.map((item) => [item.id, Number(item.expected_qty) || 0])))
const notes = reactive(Object.fromEntries(props.delivery.items.map((item) => [item.id, ''])))
const note = ref('')
const missing = ref('')
const message = computed(() => missing.value || props.error)

const expectedPieces = computed(() => piecesOf(props.delivery, 'expected_qty'))
const receivedPieces = computed(() => props.delivery.items.reduce((sum, item) => sum + (Number(qty[item.id]) || 0), 0))
const shortCount = computed(() => props.delivery.items.filter(isShort).length)

function isShort(item) {
  return (Number(qty[item.id]) || 0) < Number(item.expected_qty)
}

function step(item, by) {
  const next = (Number(qty[item.id]) || 0) + by
  qty[item.id] = Math.min(Math.max(next, 0), Number(item.expected_qty))
}

function fillAll() {
  for (const item of props.delivery.items) qty[item.id] = Number(item.expected_qty) || 0
}

function submit() {
  missing.value = ''
  for (const item of props.delivery.items) {
    const value = qty[item.id]
    if (value === '' || value === null || !Number.isInteger(Number(value)) || Number(value) < 0) {
      missing.value = `Enter how many "${item.product_name}" arrived (0 if none).`
      return
    }
    if (Number(value) > Number(item.expected_qty)) {
      missing.value = `"${item.product_name}": more than the receipt lists (${item.expected_qty}). Write the extra in the note instead.`
      return
    }
  }

  emit('confirm', {
    items: props.delivery.items.map((item) => ({
      id: item.id,
      received_qty: Number(qty[item.id]),
      note: isShort(item) ? notes[item.id].trim() : '',
    })),
    note: note.value.trim(),
  })
}
</script>

<style scoped>
.qty-btn {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.05);
  font-size: 1.05rem;
  font-weight: 800;
  color: #fff;
}

.qty-btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.08);
}

.qty-btn:disabled {
  opacity: 0.35;
}
</style>
