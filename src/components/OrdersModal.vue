<script setup>
// Orders to suppliers (Inventory > Orders, lib/orders.js): every order as a
// card that opens and closes (OrderCard.vue): what was sent, the supplier's
// answer, the email, and what can be done next.
import { computed, onMounted, ref } from 'vue'
import { listOrders, NOT_SET_UP } from '../lib/orders'
import OrderCard from './OrderCard.vue'

const emit = defineEmits(['close'])

const orders = ref([])
const ready = ref(true)
const loading = ref(true)
const errorMessage = ref('')
const view = ref('open') // open | all
const openId = ref(null)

const OPEN = ['requested', 'accepted']
const isOpenOrder = (order) => OPEN.includes(order.order_status || 'requested')
const shown = computed(() => (view.value === 'open' ? orders.value.filter(isOpenOrder) : orders.value))
const openCount = computed(() => orders.value.filter(isOpenOrder).length)

async function load() {
  try {
    const result = await listOrders()
    ready.value = result.ready
    orders.value = result.list
  } catch (err) {
    errorMessage.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

function toggle(id) {
  openId.value = openId.value === id ? null : id
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        class="flex max-h-[90vh] w-full min-w-0 max-w-3xl flex-col rounded-[28px] border border-white/10 bg-zinc-900 p-4 shadow-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orders-title"
      >
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 id="orders-title" class="text-2xl font-extrabold text-white">Orders to suppliers</h2>
          <button class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </div>

        <div class="mb-3 flex gap-2" role="group" aria-label="Show orders">
          <button
            v-for="option in [{ key: 'open', label: `Open · ${openCount}` }, { key: 'all', label: `All · ${orders.length}` }]"
            :key="option.key"
            type="button"
            class="rounded-xl px-3.5 py-1.5 text-sm font-bold"
            :class="view === option.key ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'"
            :aria-pressed="view === option.key"
            @click="view = option.key"
          >
            {{ option.label }}
          </button>
        </div>

        <p v-if="errorMessage" class="mb-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-300" role="alert">{{ errorMessage }}</p>

        <div class="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
          <p v-if="loading" class="py-10 text-center text-sm text-zinc-500">Loading…</p>
          <p v-else-if="!ready" class="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-300">{{ NOT_SET_UP }}</p>
          <p v-else-if="shown.length === 0" class="py-10 text-center text-sm text-zinc-500">
            {{ view === 'open' ? 'No open orders. Send one from Low stock > Reorder.' : 'No orders yet.' }}
          </p>

          <OrderCard
            v-for="order in shown"
            :key="order.id"
            :order="order"
            :open="openId === order.id"
            @toggle="toggle"
            @changed="load"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
