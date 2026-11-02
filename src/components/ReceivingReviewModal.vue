<template>
  <!-- The owner's look at one delivery: what the receipt said against what
       the staff member received. Approve adds what arrived to stock at the
       prices set in Check prices; Cancel sends the receipt back to Check
       prices (nothing is added). -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rv-title"
      @click.self="!busy && emit('close')"
      @keydown.esc="!busy && emit('close')"
    >
      <div class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900 shadow-2xl">
        <header class="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4 sm:px-6">
          <div class="min-w-0">
            <p class="text-xs font-extrabold uppercase tracking-[0.14em]" :class="received ? 'text-emerald-400' : 'text-sky-300'">
              {{ received ? 'Delivery received' : 'Waiting for the delivery' }}
            </p>
            <h2 id="rv-title" class="mt-1 truncate text-lg font-bold text-white" :title="delivery.file_name">
              {{ delivery.file_name || 'Receipt' }}
            </h2>
            <p class="text-xs text-zinc-400">
              <template v-if="received">
                Received by {{ delivery.received_by_name || delivery.assigned_name }} · {{ dayAndTime(delivery.received_at) }}
              </template>
              <template v-else>
                {{ delivery.assigned_name }} receives it<template v-if="delivery.expected_date"> · expected {{ dayText(delivery.expected_date) }}</template>
              </template>
              <template v-if="delivery.supplier_name"> · from {{ delivery.supplier_name }}</template>
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-700"
            :disabled="busy"
            @click="emit('close')"
          >
            Close
          </button>
        </header>

        <div class="flex flex-wrap gap-2 px-5 pt-4 sm:px-6">
          <span class="chip-sm bg-white/5 text-zinc-300">{{ count(delivery.items.length) }} products</span>
          <span class="chip-sm bg-white/5 text-zinc-300">{{ count(expectedPieces) }} pcs on the receipt</span>
          <span v-if="received" class="chip-sm" :class="short.length ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-600/15 text-emerald-300'">
            {{ short.length ? `${count(short.length)} came short` : 'Everything arrived' }}
          </span>
        </div>

        <p v-if="delivery.note" class="mx-5 mt-3 rounded-xl bg-white/5 p-3 text-sm text-zinc-300 sm:mx-6">
          <b class="text-zinc-400">Your note:</b> {{ delivery.note }}
        </p>
        <p v-if="delivery.receive_note" class="mx-5 mt-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200 sm:mx-6">
          <b>{{ delivery.received_by_name || 'Staff' }}:</b> {{ delivery.receive_note }}
        </p>

        <div class="mt-3 min-h-0 flex-1 overflow-auto px-2 sm:px-3">
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr class="text-left text-[0.65rem] uppercase tracking-[0.12em] text-zinc-500">
                <th class="px-3 py-2 font-bold">Product</th>
                <th class="px-3 py-2 text-right font-bold">On receipt</th>
                <th class="px-3 py-2 text-right font-bold">Received</th>
                <th class="px-3 py-2 text-right font-bold">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in delivery.items" :key="item.id" class="border-t border-white/5" :class="{ 'bg-amber-500/[0.06]': isShort(item) }">
                <td class="px-3 py-2.5">
                  <p class="font-bold text-white">{{ item.product_name }}</p>
                  <p class="text-xs">
                    <span :class="item.is_new ? 'text-sky-300' : 'text-zinc-500'">{{ item.is_new ? 'New product' : 'Restock' }}</span>
                    <span v-if="item.note" class="text-amber-300"> · {{ item.note }}</span>
                  </p>
                </td>
                <td class="px-3 py-2.5 text-right tabular-nums text-zinc-300">{{ count(item.expected_qty) }}</td>
                <td class="px-3 py-2.5 text-right font-bold tabular-nums" :class="!received ? 'text-zinc-600' : isShort(item) ? 'text-amber-300' : 'text-emerald-300'">
                  {{ received ? count(item.received_qty) : '—' }}
                </td>
                <td class="px-3 py-2.5 text-right tabular-nums text-zinc-200">{{ peso(item.price) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer class="flex flex-col gap-3 border-t border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div class="min-w-0 text-sm">
            <p v-if="error" class="font-bold text-red-400" role="alert">{{ error }}</p>
            <p v-else-if="askingCancel" class="font-bold text-amber-300" role="alert">
              Cancel this delivery? The receipt goes back to Prices to check; nothing is added.
            </p>
            <p v-else-if="received" class="text-zinc-400">
              Approve adds <b class="text-white">{{ count(receivedPieces) }} pcs</b> to stock at these prices.
              <template v-if="missingCount"> {{ count(missingCount) }} that didn't arrive at all won't be added.</template>
            </p>
            <p v-else class="text-zinc-400">Nothing is in stock yet. {{ delivery.assigned_name }} marks it delivered when it arrives.</p>
          </div>

          <div v-if="askingCancel" class="flex shrink-0 gap-2">
            <button type="button" class="btn-lg bg-zinc-800 text-white hover:bg-zinc-700" @click="askingCancel = false">Back</button>
            <button type="button" class="btn-lg bg-red-600 text-white hover:bg-red-700" :disabled="busy" @click="emit('cancel-delivery')">
              {{ busy ? 'Cancelling…' : 'Yes, cancel' }}
            </button>
          </div>
          <div v-else class="flex shrink-0 gap-2">
            <button type="button" class="btn-lg bg-zinc-800 text-white hover:bg-red-600" :disabled="busy" @click="askingCancel = true">
              Cancel delivery
            </button>
            <button
              v-if="received"
              type="button"
              class="btn-lg bg-emerald-600 text-white hover:bg-emerald-500"
              :disabled="busy"
              @click="emit('approve')"
            >
              {{ busy ? 'Adding…' : 'Approve & add to stock' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { count, dayAndTime, peso } from '../lib/format'
import { dayText, piecesOf, shortItems } from '../lib/receiving'

const props = defineProps({
  delivery: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['approve', 'cancel-delivery', 'close'])

const askingCancel = ref(false)
const received = computed(() => props.delivery.status === 'received')
const expectedPieces = computed(() => piecesOf(props.delivery, 'expected_qty'))
const receivedPieces = computed(() => piecesOf(props.delivery, 'received_qty'))
const short = computed(() => shortItems(props.delivery))
const missingCount = computed(() => props.delivery.items.filter((item) => received.value && Number(item.received_qty) === 0).length)

function isShort(item) {
  return received.value && Number(item.received_qty) < Number(item.expected_qty)
}
</script>

<style scoped>
.chip-sm {
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
}

.btn-lg {
  flex: 1;
  border-radius: 1rem;
  padding: 0.75rem 1.25rem;
  font-weight: 700;
}

.btn-lg:disabled {
  opacity: 0.5;
}

@media (min-width: 640px) {
  .btn-lg {
    flex: none;
  }
}
</style>
