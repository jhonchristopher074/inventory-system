<script setup>
// Supplier > Orders (lib/orders.js): the orders 10 FIVE 7 sent this
// supplier (also emailed to them). Products and quantities only, never
// stock or prices. A new one is accepted with a delivery date (it goes on
// the store's Calendar) or declined with a reason.
//
//   <SupplierOrdersTab @count="openOrders = $event" />   count: orders to answer
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ORDER_STATES, listMyOrders, orderPieces, respondOrder, NOT_SET_UP } from '../lib/orders'
import { count, dayAndTime } from '../lib/format'
import NavIcon from './NavIcon.vue'

const emit = defineEmits(['count'])

const orders = ref([])
const ready = ref(true)
const loading = ref(true)
const message = ref(null) // { ok, text }
const answering = ref(null) // { id, mode: 'accept' | 'decline', date, reply, busy }

// today in Manila, as the date box wants it
function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

const waiting = computed(() => orders.value.filter((order) => order.order_status === 'requested'))

async function load() {
  try {
    const result = await listMyOrders()
    ready.value = result.ready
    orders.value = result.list
    emit('count', waiting.value.length)
  } catch (err) {
    message.value = { ok: false, text: err.message }
  } finally {
    loading.value = false
  }
}

let timer = null
onMounted(() => {
  load()
  // a new order shows up by itself
  timer = setInterval(() => {
    if (!answering.value) load()
  }, 30000)
})
onUnmounted(() => clearInterval(timer))

function start(order, mode) {
  message.value = null
  answering.value = { id: order.id, mode, date: todayKey(), reply: '', busy: false }
}

async function submit(order) {
  const form = answering.value
  if (!form || form.busy) return
  if (form.mode === 'decline' && !form.reply.trim()) {
    message.value = { ok: false, text: 'Say why you decline the order.' }
    return
  }
  form.busy = true
  try {
    await respondOrder(order.id, form.mode === 'accept', form.mode === 'accept' ? form.date : null, form.reply.trim())
    message.value =
      form.mode === 'accept'
        ? { ok: true, text: `Order #${order.id} accepted. The store expects it on ${form.date}.` }
        : { ok: true, text: `Order #${order.id} declined. The store was told.` }
    answering.value = null
    await load()
  } catch (err) {
    message.value = { ok: false, text: err.message }
    form.busy = false
  }
}

function stateOf(order) {
  if (order.order_status === 'requested') return { label: 'New: please answer', tone: 'bg-amber-500/15 text-amber-300' }
  return ORDER_STATES[order.order_status] || ORDER_STATES.requested
}
</script>

<template>
  <section aria-label="Orders" class="mx-auto max-w-3xl space-y-3">
    <p class="text-sm text-zinc-400">
      Orders from 10 FIVE 7 Hardware. They're also sent to your email. Accept with the day you'll deliver, or decline.
    </p>

    <p
      v-if="message"
      class="rounded-xl p-3 text-sm"
      :class="message.ok ? 'bg-emerald-600/15 text-emerald-300' : 'bg-red-600/15 text-red-300'"
      role="status"
    >
      {{ message.text }}
    </p>

    <p v-if="loading" class="card p-5 text-sm text-zinc-500">Loading…</p>
    <p v-else-if="!ready" class="card p-5 text-sm text-amber-300">{{ NOT_SET_UP }}</p>
    <p v-else-if="orders.length === 0" class="card p-5 text-sm text-zinc-400">No orders yet. New orders from the store show up here.</p>

    <article v-for="order in orders" :key="order.id" class="card p-4 sm:p-5">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-lg font-bold text-white">Order #{{ order.id }}</p>
          <p class="text-xs text-zinc-500">
            {{ dayAndTime(order.created_at) }}{{ order.ordered_by ? ` · from ${order.ordered_by}` : '' }} · {{ count(orderPieces(order)) }} pcs
          </p>
        </div>
        <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" :class="stateOf(order).tone">{{ stateOf(order).label }}</span>
      </div>

      <ul class="mt-3 divide-y divide-white/5 rounded-xl border border-white/10">
        <li v-for="(item, i) in order.items" :key="i" class="flex justify-between gap-3 px-3 py-2 text-sm">
          <span class="min-w-0 text-zinc-200">{{ item.product_name }}</span>
          <span class="shrink-0 font-bold text-white">{{ count(item.qty) }} pcs</span>
        </li>
      </ul>

      <p v-if="order.note" class="mt-2 text-sm text-zinc-300"><b class="text-zinc-400">Note from the store:</b> {{ order.note }}</p>
      <p v-if="order.expected_date" class="mt-2 text-sm font-bold text-emerald-300">You deliver on {{ order.expected_date }}</p>
      <p v-if="order.supplier_reply" class="mt-1 text-sm text-zinc-400"><b>Your message:</b> {{ order.supplier_reply }}</p>

      <!-- a new order: answer it -->
      <template v-if="order.order_status === 'requested'">
        <div v-if="answering?.id !== order.id" class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="ans-btn bg-emerald-600 hover:bg-emerald-500" @click="start(order, 'accept')">
            <NavIcon name="check" class="h-4 w-4" /> Accept
          </button>
          <button type="button" class="ans-btn bg-zinc-800 hover:bg-zinc-700" @click="start(order, 'decline')">Decline</button>
        </div>

        <form v-else class="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3" @submit.prevent="submit(order)">
          <template v-if="answering.mode === 'accept'">
            <label :for="`order-date-${order.id}`" class="block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Delivery date</label>
            <input
              :id="`order-date-${order.id}`"
              v-model="answering.date"
              type="date"
              :min="todayKey()"
              required
              class="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white sm:w-56"
            />
          </template>
          <label :for="`order-reply-${order.id}`" class="block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
            {{ answering.mode === 'accept' ? 'Message (optional)' : 'Why you decline' }}
          </label>
          <input
            :id="`order-reply-${order.id}`"
            v-model="answering.reply"
            type="text"
            maxlength="300"
            :placeholder="answering.mode === 'accept' ? 'e.g. 2 boxes come on the next trip' : 'e.g. Out of stock until next month'"
            class="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <div class="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              class="ans-btn"
              :class="answering.mode === 'accept' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-700'"
              :disabled="answering.busy"
            >
              {{ answering.busy ? 'Saving…' : answering.mode === 'accept' ? 'Accept order' : 'Decline order' }}
            </button>
            <button type="button" class="ans-btn bg-zinc-800 hover:bg-zinc-700" :disabled="answering.busy" @click="answering = null">Back</button>
          </div>
        </form>
      </template>
    </article>
  </section>
</template>

<style scoped>
.ans-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.75rem;
  padding: 0.55rem 1rem;
  font-size: 0.88rem;
  font-weight: 800;
  color: #fff;
}

.ans-btn:disabled {
  opacity: 0.55;
}
</style>
