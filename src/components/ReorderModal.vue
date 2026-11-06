<script setup>
// "Order again" window of Inventory (supabase 20261109000001_reorder_low_stock.sql)
//
//   Order again  the products running low, by supplier. Pick them, set the
//                pieces, Review, then Send: the order is saved for n8n,
//                which emails it to the supplier and marks it sent.
//   Orders       the orders of the last 60 days and where they are.
//
//   <ReorderModal :tab="'order' | 'orders'" @close="..." @sent="..." />
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { count, dayAndTime } from '../lib/format'
import { LOW_STOCK } from '../lib/stock'
import { toast } from '../lib/toast'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  tab: { type: String, default: 'order' },
})
const emit = defineEmits(['close', 'sent'])

const activeTab = ref(props.tab === 'orders' ? 'orders' : 'order')

const loading = ref(true)
const loadError = ref('')
const products = ref([])
const suppliers = ref([])
const orders = ref([])

const picked = ref({}) // product id -> true
const qtys = ref({}) // product id -> '20'
const notes = ref({}) // supplier id -> note
const reviewing = ref(null) // supplier id under review
const sending = ref(false)
const actionError = ref('')
const supplierSaving = ref({}) // product id -> true

// enough to be back at twice the low mark
function suggestedQty(product) {
  return String(Math.max(LOW_STOCK * 2 - Number(product.quantity || 0), 1))
}

// ordered in the last days (or waiting to go): not picked at first
function recentlyOrdered(product) {
  return Boolean(product.last_order)
}

async function load() {
  loading.value = true
  loadError.value = ''
  const [candidates, list] = await Promise.all([
    supabase.rpc('admin_reorder_candidates', { p_low: LOW_STOCK }),
    supabase.rpc('admin_list_purchase_orders'),
  ])
  loading.value = false

  const error = candidates.error || list.error
  if (error) {
    loadError.value = /admin_reorder_candidates|admin_list_purchase_orders|schema cache/i.test(error.message)
      ? 'Ordering isn\'t set up yet: run 20261109000001_reorder_low_stock.sql in Supabase.'
      : error.message
    return
  }

  products.value = candidates.data?.products || []
  suppliers.value = candidates.data?.suppliers || []
  orders.value = list.data || []

  const nextPicked = {}
  const nextQtys = {}
  for (const product of products.value) {
    nextPicked[product.id] = picked.value[product.id] ?? !recentlyOrdered(product)
    nextQtys[product.id] = qtys.value[product.id] ?? suggestedQty(product)
  }
  picked.value = nextPicked
  qtys.value = nextQtys
}

onMounted(load)

/* ------------------------------------------------------------------
   Order again
------------------------------------------------------------------ */
const noSupplier = computed(() => products.value.filter((product) => !product.supplier_id))

const groups = computed(() => {
  const map = new Map()
  for (const product of products.value) {
    if (!product.supplier_id) continue
    if (!map.has(product.supplier_id)) {
      map.set(product.supplier_id, {
        id: product.supplier_id,
        name: product.supplier_name,
        email: product.supplier_email,
        products: [],
      })
    }
    map.get(product.supplier_id).products.push(product)
  }
  return [...map.values()]
})

function isQtyValid(product) {
  const value = String(qtys.value[product.id] ?? '').trim()
  return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 1000000
}

function pickedOf(group) {
  return group.products.filter((product) => picked.value[product.id])
}

function piecesOf(group) {
  return pickedOf(group).reduce((sum, product) => sum + Number(qtys.value[product.id] || 0), 0)
}

function canReview(group) {
  return pickedOf(group).length > 0 && pickedOf(group).every(isQtyValid) && !sending.value
}

function setQty(product, value) {
  qtys.value = { ...qtys.value, [product.id]: value }
}

function step(product, by) {
  const now = Number(qtys.value[product.id]) || 0
  setQty(product, String(Math.max(now + by, 1)))
}

function togglePick(product) {
  picked.value = { ...picked.value, [product.id]: !picked.value[product.id] }
}

async function setSupplier(product, supplierId) {
  if (!supplierId) return
  actionError.value = ''
  supplierSaving.value = { ...supplierSaving.value, [product.id]: true }
  const { error } = await supabase.rpc('admin_set_product_supplier', {
    p_product_id: Number(product.id),
    p_supplier_id: supplierId,
  })
  supplierSaving.value = { ...supplierSaving.value, [product.id]: false }
  if (error) {
    actionError.value = `Couldn't save the supplier: ${error.message}`
    return
  }
  const supplier = suppliers.value.find((item) => item.id === supplierId)
  products.value = products.value.map((item) =>
    item.id === product.id
      ? { ...item, supplier_id: supplierId, supplier_name: supplier?.name, supplier_email: supplier?.email }
      : item
  )
}

async function send(group) {
  if (!canReview(group)) return
  sending.value = true
  actionError.value = ''
  const items = pickedOf(group).map((product) => ({ product_id: Number(product.id), qty: Number(qtys.value[product.id]) }))
  const { error } = await supabase.rpc('admin_create_purchase_order', {
    p_supplier_id: group.id,
    p_items: items,
    p_note: (notes.value[group.id] || '').trim() || null,
  })
  sending.value = false
  if (error) {
    actionError.value = `Couldn't send the order: ${error.message}`
    return
  }
  reviewing.value = null
  notes.value = { ...notes.value, [group.id]: '' }
  toast(`Order for ${group.name} saved: it's emailed to ${group.email} shortly.`)
  emit('sent')
  await load()
  activeTab.value = 'orders'
}

/* ------------------------------------------------------------------
   Orders
------------------------------------------------------------------ */
const STATUS = {
  to_send: { text: 'Sending…', tone: 'bg-sky-500/15 text-sky-300' },
  sent: { text: 'Sent', tone: 'bg-emerald-600/15 text-emerald-300' },
  failed: { text: 'Not sent', tone: 'bg-red-600/20 text-red-300' },
  cancelled: { text: 'Cancelled', tone: 'bg-white/5 text-zinc-400' },
}

const openOrders = computed(() => orders.value.filter((order) => order.status === 'to_send' || order.status === 'failed').length)

async function orderAction(order, action) {
  actionError.value = ''
  const { error } = await supabase.rpc(
    action === 'cancel' ? 'admin_cancel_purchase_order' : 'admin_retry_purchase_order',
    { p_order_id: order.id }
  )
  if (error) {
    actionError.value = error.message
    return
  }
  toast(action === 'cancel' ? 'Order cancelled.' : 'Sending the order again.')
  await load()
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[1950] flex items-center justify-center bg-black/80 p-2 sm:p-4" @click.self="emit('close')">
      <div
        class="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reorder-title"
        @keydown.esc="emit('close')"
      >
        <!-- HEADER + TABS -->
        <header class="border-b border-white/5 px-4 pt-4 sm:px-6">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-zinc-500">Low stock</p>
              <h2 id="reorder-title" class="mt-0.5 text-xl font-extrabold text-white sm:text-2xl">Order again</h2>
            </div>
            <button
              type="button"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close"
              @click="emit('close')"
            >
              ✕
            </button>
          </div>

          <div class="mt-3 flex gap-1" role="tablist">
            <button
              v-for="tab in [{ key: 'order', label: 'Products to order', n: products.length }, { key: 'orders', label: 'Orders', n: openOrders }]"
              :key="tab.key"
              type="button"
              role="tab"
              class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-bold"
              :class="activeTab === tab.key ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'"
              :aria-selected="activeTab === tab.key"
              @click="activeTab = tab.key; reviewing = null"
            >
              {{ tab.label }}
              <span v-if="tab.n > 0" class="rounded-full bg-white/10 px-1.5 text-xs">{{ count(tab.n) }}</span>
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <p v-if="loading" class="py-8 text-center text-sm text-zinc-400">Loading…</p>
          <p v-else-if="loadError" class="rounded-xl bg-red-600/15 p-4 text-sm text-red-300" role="alert">{{ loadError }}</p>

          <template v-else>
            <p v-if="actionError" class="mb-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-300" role="alert">{{ actionError }}</p>

            <!-- ================= PRODUCTS TO ORDER ================= -->
            <template v-if="activeTab === 'order'">
              <p v-if="products.length === 0" class="rounded-2xl border border-dashed border-white/15 p-8 text-center text-zinc-400">
                Nothing is running low ({{ LOW_STOCK }} or fewer left). Nothing to order.
              </p>

              <!-- products with no supplier: pick one, or they can't be ordered -->
              <section v-if="noSupplier.length" class="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
                <p class="flex items-center gap-2 text-sm font-bold text-amber-200">
                  <NavIcon name="alert" class="h-4 w-4" />
                  {{ count(noSupplier.length) }} {{ noSupplier.length === 1 ? 'product has' : 'products have' }} no supplier yet
                </p>
                <p class="mt-1 text-xs text-zinc-400">Pick who supplies it; it's remembered for next time.</p>
                <ul class="mt-3 space-y-2">
                  <li v-for="product in noSupplier" :key="product.id" class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span class="min-w-0 flex-1 truncate text-sm font-bold text-white" :title="product.name">{{ product.name }}</span>
                    <span class="text-xs font-bold" :class="product.quantity <= 0 ? 'text-red-400' : 'text-amber-300'">
                      {{ product.quantity <= 0 ? 'Out' : count(product.quantity) + ' left' }}
                    </span>
                    <select
                      class="select"
                      :disabled="supplierSaving[product.id] || suppliers.length === 0"
                      :aria-label="'Supplier of ' + product.name"
                      @change="setSupplier(product, $event.target.value)"
                    >
                      <option value="">{{ suppliers.length ? 'Choose supplier…' : 'No supplier accounts' }}</option>
                      <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option>
                    </select>
                  </li>
                </ul>
              </section>

              <!-- one card per supplier -->
              <section
                v-for="group in groups"
                :key="group.id"
                class="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40"
              >
                <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-white/5 px-4 py-3">
                  <p class="font-extrabold text-white">{{ group.name }}</p>
                  <p class="truncate text-xs text-zinc-400">{{ group.email }}</p>
                </div>

                <!-- review: exactly what goes out -->
                <div v-if="reviewing === group.id" class="p-4">
                  <p class="text-sm text-zinc-300">
                    This order is emailed to <b class="text-white">{{ group.email }}</b>:
                  </p>
                  <ul class="mt-3 divide-y divide-white/5 rounded-xl bg-white/5 text-sm">
                    <li v-for="product in pickedOf(group)" :key="product.id" class="flex justify-between gap-3 px-3 py-2">
                      <span class="min-w-0 truncate text-zinc-200">{{ product.name }}</span>
                      <b class="shrink-0 tabular-nums text-white">{{ count(Number(qtys[product.id])) }} pcs</b>
                    </li>
                  </ul>
                  <p v-if="notes[group.id]" class="mt-2 text-sm text-zinc-400">Note: “{{ notes[group.id] }}”</p>
                  <div class="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" class="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-700" :disabled="sending" @click="reviewing = null">
                      Back
                    </button>
                    <button
                      type="button"
                      class="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      :disabled="sending"
                      @click="send(group)"
                    >
                      {{ sending ? 'Sending…' : `Yes, send ${count(piecesOf(group))} pcs` }}
                    </button>
                  </div>
                </div>

                <template v-else>
                  <ul class="divide-y divide-white/5">
                    <li
                      v-for="product in group.products"
                      :key="product.id"
                      class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5"
                      :class="{ 'opacity-50': !picked[product.id] }"
                    >
                      <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input type="checkbox" class="h-4 w-4 shrink-0 accent-red-600" :checked="picked[product.id]" @change="togglePick(product)" />
                        <span class="min-w-0">
                          <span class="block truncate text-sm font-bold text-white" :title="product.name">{{ product.name }}</span>
                          <span class="flex flex-wrap gap-x-2 text-xs">
                            <span :class="product.quantity <= 0 ? 'font-bold text-red-400' : 'text-amber-300'">
                              {{ product.quantity <= 0 ? 'Out of stock' : count(product.quantity) + ' left' }}
                            </span>
                            <span v-if="product.last_order" class="text-sky-300">
                              · ordered {{ dayAndTime(product.last_order.at) }} ({{ count(product.last_order.qty) }} pcs{{ product.last_order.status === 'sent' ? '' : ', ' + STATUS[product.last_order.status]?.text.toLowerCase() }})
                            </span>
                          </span>
                        </span>
                      </label>

                      <div class="stepper" :class="{ 'is-invalid': picked[product.id] && !isQtyValid(product) }">
                        <button type="button" :disabled="!picked[product.id]" aria-label="Fewer" @click="step(product, -1)">−</button>
                        <input
                          type="number"
                          inputmode="numeric"
                          min="1"
                          :value="qtys[product.id]"
                          :disabled="!picked[product.id]"
                          :aria-label="'Pieces of ' + product.name"
                          @input="setQty(product, $event.target.value)"
                        />
                        <button type="button" :disabled="!picked[product.id]" aria-label="More" @click="step(product, 1)">+</button>
                      </div>
                    </li>
                  </ul>

                  <div class="flex flex-col gap-2 border-t border-white/5 px-4 py-3 sm:flex-row sm:items-center">
                    <input
                      v-model="notes[group.id]"
                      type="text"
                      maxlength="500"
                      placeholder="Note for the supplier (optional)"
                      class="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
                    />
                    <button
                      type="button"
                      class="shrink-0 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
                      :disabled="!canReview(group)"
                      @click="reviewing = group.id"
                    >
                      Review order · {{ count(pickedOf(group).length) }} {{ pickedOf(group).length === 1 ? 'product' : 'products' }}
                    </button>
                  </div>
                </template>
              </section>
            </template>

            <!-- ================= ORDERS ================= -->
            <template v-else>
              <p v-if="orders.length === 0" class="rounded-2xl border border-dashed border-white/15 p-8 text-center text-zinc-400">
                No orders in the last 60 days.
              </p>
              <article
                v-for="order in orders"
                :key="order.id"
                class="mb-3 rounded-2xl border border-white/10 bg-zinc-950/40 p-4"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-extrabold text-white">{{ order.supplier_name }}</p>
                    <p class="truncate text-xs text-zinc-400">
                      {{ order.supplier_email }} · {{ dayAndTime(order.created_at) }}<template v-if="order.created_by_name"> · by {{ order.created_by_name }}</template>
                    </p>
                  </div>
                  <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" :class="STATUS[order.status]?.tone">
                    {{ STATUS[order.status]?.text || order.status }}
                  </span>
                </div>
                <p class="mt-2 text-sm text-zinc-300">
                  <template v-for="(item, i) in order.items" :key="i">{{ i ? ' · ' : '' }}{{ item.product_name }} <b class="text-white">×{{ count(item.qty) }}</b></template>
                </p>
                <p v-if="order.note" class="mt-1 text-xs text-zinc-500">Note: “{{ order.note }}”</p>
                <p v-if="order.status === 'failed' && order.error" class="mt-2 text-xs text-red-300">{{ order.error }}</p>
                <p v-else-if="order.status === 'sent' && order.sent_at" class="mt-2 text-xs text-emerald-300/80">Emailed {{ dayAndTime(order.sent_at) }}</p>

                <div v-if="order.status === 'to_send' || order.status === 'failed'" class="mt-3 flex justify-end gap-2">
                  <button type="button" class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700" @click="orderAction(order, 'cancel')">
                    Cancel order
                  </button>
                  <button
                    v-if="order.status === 'failed'"
                    type="button"
                    class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    @click="orderAction(order, 'retry')"
                  >
                    Try again
                  </button>
                </div>
              </article>
            </template>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.select {
  max-width: 13rem;
  cursor: pointer;
  border-radius: 0.65rem;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  color: var(--color-zinc-200);
  outline: none;
}

.select option {
  background: var(--surface);
  color: #fff;
}

.stepper {
  display: inline-flex;
  flex: none;
  align-items: center;
  overflow: hidden;
  border-radius: 0.7rem;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
}

.stepper.is-invalid {
  border-color: rgba(239, 68, 68, 0.85);
}

.stepper button {
  width: 1.9rem;
  align-self: stretch;
  font-weight: 800;
  color: var(--color-zinc-300);
}

.stepper button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.stepper button:disabled {
  opacity: 0.3;
}

.stepper input {
  width: 3.4rem;
  border: 0;
  background: transparent;
  padding: 0.45rem 0;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #fff;
  outline: none;
  appearance: textfield;
}

.stepper input::-webkit-outer-spin-button,
.stepper input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}
</style>
