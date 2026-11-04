<template>
  <!-- Cashier: ask the owner to refund products a customer brought back
       (lib/refunds.js). Pick the sale (or start from one, :sale), how many
       of each product came back, and why. owner: any cashier's sale, and the
       refund is applied at once (no request). Only today's sales can be
       refunded (the database checks it too). Nothing changes until the owner
       approves it; then the sale goes down and the pieces go back in stock. -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rf-title"
      @click.self="!busy && emit('close')"
      @keydown.esc="!busy && emit('close')"
    >
      <div class="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-amber-500/30 bg-zinc-900 shadow-2xl">
        <header class="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div class="min-w-0">
            <p class="text-xs font-extrabold uppercase tracking-[0.14em] text-amber-300">Refund</p>
            <h2 id="rf-title" class="mt-1 text-lg font-bold text-white">
              {{ chosen ? `Sale #${chosen.id}` : 'Which sale?' }}
            </h2>
            <p class="text-xs text-zinc-400">
              <template v-if="chosen">{{ dayAndTime(chosen.created_at) }} · {{ peso(chosen.total_amount) }}</template>
              <template v-else>Only today's sales can be refunded</template>
            </p>
          </div>
          <button type="button" class="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-700" :disabled="busy" @click="emit('close')">
            Close
          </button>
        </header>

        <p v-if="loadError" class="m-5 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ loadError }}</p>

        <!-- 1. the sale -->
        <div v-else-if="!chosen" class="flex min-h-0 flex-1 flex-col">
          <div class="px-5 pt-4">
            <input
              v-model="search"
              type="text"
              autocomplete="off"
              placeholder="Sale # or product…"
              aria-label="Find the sale"
              class="w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
            />
          </div>

          <div class="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <p v-if="loading" class="py-6 text-center text-sm text-zinc-400">Loading your sales…</p>
            <p v-else-if="foundSales.length === 0" class="py-6 text-center text-sm text-zinc-400">
              {{ search ? 'No sale matches.' : 'No sales yet today.' }}
            </p>
            <ul v-else class="divide-y divide-white/5">
              <li v-for="sale in foundSales" :key="sale.id">
                <button type="button" class="flex w-full items-center gap-3 py-3 text-left hover:bg-white/[0.03]" @click="choose(sale)">
                  <span class="w-16 shrink-0 font-bold text-white">#{{ sale.id }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-zinc-300">{{ productNames(sale) }}</span>
                    <span class="block text-xs text-zinc-500">
                      {{ dayAndTime(sale.created_at) }}<template v-if="owner && sale.cashier_name"> · {{ sale.cashier_name }}</template>
                    </span>
                  </span>
                  <span v-if="pendingSales.has(String(sale.id))" class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-300">asked</span>
                  <span class="shrink-0 font-bold tabular-nums text-white">{{ peso(sale.total_amount) }}</span>
                </button>
              </li>
            </ul>

            <!-- what was asked before -->
            <template v-if="!owner && requests.length > 0">
              <h3 class="mt-5 text-xs font-extrabold uppercase tracking-[0.14em] text-zinc-500">Your refund requests</h3>
              <ul class="mt-2 space-y-2">
                <li v-for="request in requests.slice(0, 6)" :key="request.id" class="rounded-xl bg-white/[0.03] p-3 text-sm">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-bold text-white">Sale #{{ request.sale_id }} · {{ peso(request.amount) }}</span>
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold" :class="STATUS[request.status]?.tone">{{ STATUS[request.status]?.text }}</span>
                  </div>
                  <p class="mt-0.5 truncate text-xs text-zinc-400">
                    {{ request.items.map((item) => `${item.quantity} × ${item.product_name}`).join(', ') }}
                  </p>
                  <p v-if="request.reject_reason" class="mt-1 text-xs text-red-300">Reason: {{ request.reject_reason }}</p>
                </li>
              </ul>
            </template>
          </div>
        </div>

        <!-- 2. what came back, and why -->
        <form v-else class="flex min-h-0 flex-1 flex-col" @submit.prevent="send">
          <p class="px-5 pt-3 text-sm text-zinc-400">How many of each product did the customer bring back?</p>

          <ul class="mt-1 min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto px-5">
            <li v-for="item in chosenItems" :key="item.id" class="flex items-center gap-3 py-3">
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-white" :title="item.product_name">{{ item.product_name }}</p>
                <p class="text-xs text-zinc-500">
                  Sold {{ count(item.quantity) }} × {{ peso(item.price) }}
                  <span v-if="item.refunded_qty > 0" class="text-zinc-400"> · {{ count(item.refunded_qty) }} refunded</span>
                  <span v-if="pendingOf(item) > 0" class="text-amber-300"> · {{ count(pendingOf(item)) }} asked already</span>
                </p>
              </div>
              <p v-if="canRefund(item) === 0" class="shrink-0 text-xs font-bold text-zinc-500">Nothing left</p>
              <div v-else class="flex shrink-0 items-center gap-1">
                <button type="button" class="qty-btn" :disabled="busy || qty[item.id] <= 0" :aria-label="'One less ' + item.product_name" @click="step(item, -1)">−</button>
                <input
                  v-model.number="qty[item.id]"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  :max="canRefund(item)"
                  :aria-label="'Refund how many ' + item.product_name"
                  class="w-14 rounded-lg border border-white/10 bg-black px-2 py-1.5 text-center text-sm font-bold text-white outline-none focus:border-amber-400"
                  :disabled="busy"
                />
                <button type="button" class="qty-btn" :disabled="busy || qty[item.id] >= canRefund(item)" :aria-label="'One more ' + item.product_name" @click="step(item, 1)">+</button>
              </div>
            </li>
          </ul>

          <div class="border-t border-white/5 px-5 py-3">
            <label class="text-xs text-zinc-500" for="rf-note">Why was it returned? (optional)</label>
            <input
              id="rf-note"
              v-model="note"
              type="text"
              maxlength="200"
              autocomplete="off"
              placeholder="e.g. damaged, wrong size"
              class="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
              :disabled="busy"
            />
          </div>

          <footer class="flex flex-col gap-3 border-t border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm" :class="message ? 'font-bold text-red-400' : 'text-zinc-400'" :role="message ? 'alert' : null">
              <template v-if="message">{{ message }}</template>
              <template v-else-if="pieces > 0 && owner">Refund <b class="text-white">{{ peso(amount) }}</b> · {{ count(pieces) }} pcs go back into stock now.</template>
              <template v-else-if="pieces > 0">Refund <b class="text-white">{{ peso(amount) }}</b> · {{ count(pieces) }} pcs, after the owner approves.</template>
              <template v-else>Choose what came back.</template>
            </p>
            <div class="flex shrink-0 gap-2">
              <button
                v-if="!sale"
                type="button"
                class="flex-1 rounded-2xl bg-zinc-800 px-5 py-3 font-bold text-white hover:bg-zinc-700 disabled:opacity-50 sm:flex-none"
                :disabled="busy"
                @click="chosen = null"
              >
                Back
              </button>
              <button type="submit" class="flex-1 rounded-2xl bg-amber-500 px-6 py-3 font-bold text-black hover:bg-amber-400 disabled:opacity-50 sm:flex-none" :disabled="busy || pieces === 0">
                {{ busy ? (owner ? 'Refunding…' : 'Sending…') : owner ? 'Refund now' : 'Send to the owner' }}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { count, dayAndTime, peso } from '../lib/format'
import { STATUS, decideRefund, isToday, listAllRefunds, listMyRefunds, pendingBySaleItem, recent, requestRefund } from '../lib/refunds'

const props = defineProps({
  // start from this sale (Sales History); none = pick one
  sale: { type: Object, default: null },
  // the owner's POS: every cashier's sales, and refunded at once
  owner: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'sent'])

const sales = ref([])
const requests = ref([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')
const chosen = ref(props.sale)
const qty = reactive({})
const note = ref('')
const busy = ref(false)
const message = ref('')

const pending = computed(() => pendingBySaleItem(requests.value))
const pendingSales = computed(
  () => new Set(requests.value.filter((request) => request.status === 'pending').map((request) => String(request.sale_id)))
)

const foundSales = computed(() => {
  const text = search.value.trim().toLowerCase().replace(/^#/, '')
  const list = text
    ? sales.value.filter(
        (sale) =>
          String(sale.id).startsWith(text) ||
          (sale.sale_items || []).some((item) => String(item.product_name || '').toLowerCase().includes(text))
      )
    : sales.value
  return list.slice(0, 40)
})

// fully refunded products aren't listed
const chosenItems = computed(() => (chosen.value?.sale_items || []).filter((item) => Number(item.quantity) > 0))
const pieces = computed(() => chosenItems.value.reduce((sum, item) => sum + (Number(qty[item.id]) || 0), 0))
const amount = computed(() =>
  chosenItems.value.reduce((sum, item) => sum + (Number(qty[item.id]) || 0) * Number(item.price || 0), 0)
)

function productNames(sale) {
  return (sale.sale_items || []).map((item) => item.product_name).join(', ') || '—'
}

function pendingOf(item) {
  return pending.value.get(String(item.id)) || 0
}

// what can still be asked for: sold (refunds already taken off) minus asked
function canRefund(item) {
  return Math.max(Number(item.quantity || 0) - pendingOf(item), 0)
}

function choose(sale) {
  message.value = ''
  chosen.value = sale
}

// each product of the chosen sale starts at 0
watch(
  chosen,
  (sale) => {
    for (const key of Object.keys(qty)) delete qty[key]
    for (const item of sale?.sale_items || []) qty[item.id] = 0
  },
  { immediate: true }
)

function step(item, by) {
  const next = (Number(qty[item.id]) || 0) + by
  qty[item.id] = Math.min(Math.max(next, 0), canRefund(item))
}

async function send() {
  message.value = ''
  const items = []
  for (const item of chosenItems.value) {
    const value = Number(qty[item.id]) || 0
    if (!Number.isInteger(value) || value < 0 || value > canRefund(item)) {
      message.value = `"${item.product_name}": enter 0 to ${canRefund(item)}.`
      return
    }
    if (value > 0) items.push({ sale_item_id: item.id, quantity: value })
  }
  if (items.length === 0) return

  busy.value = true
  try {
    const id = await requestRefund(chosen.value.id, items, note.value.trim())
    if (props.owner) {
      try {
        await decideRefund(id, true, '')
      } catch (err) {
        throw new Error(`Saved, but not refunded yet: ${err.message} Finish it in Approval › Refunds.`, { cause: err })
      }
      emit('sent', `Refunded ${peso(amount.value)} from sale #${chosen.value.id}: ${count(pieces.value)} pcs back in stock. Give the customer the money.`)
    } else {
      emit('sent', `Refund of ${peso(amount.value)} from sale #${chosen.value.id} sent to the owner. Give the money back once it's approved.`)
    }
  } catch (err) {
    message.value = err.message
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString() // today
    const [mine, salesResult] = await Promise.all([
      props.owner ? listAllRefunds() : listMyRefunds(),
      props.sale
        ? Promise.resolve({ data: [] })
        : props.owner
          ? supabase.rpc('list_all_sales')
          : supabase.rpc('list_my_sales_since', { p_since: since }),
    ])
    requests.value = recent(mine.list)
    if (salesResult.error) throw salesResult.error
    // today's, and only ones with something left to refund
    sales.value = (salesResult.data || [])
      .filter(isToday)
      .filter((sale) => (sale.sale_items || []).some((item) => Number(item.quantity) > 0))
  } catch (err) {
    loadError.value = `Couldn't load your sales: ${err.message}`
  } finally {
    loading.value = false
  }
})
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
