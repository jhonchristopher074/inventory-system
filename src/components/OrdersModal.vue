<script setup>
// Orders to suppliers (Inventory > Orders, lib/orders.js): every order in a
// table (OrdersTable.vue); each row opens with what was sent, the supplier's
// answer, the email, and what can be done next.
import { onMounted, ref } from 'vue'
import { listOrders, NOT_SET_UP } from '../lib/orders'
import OrdersTable from './OrdersTable.vue'

const emit = defineEmits(['close'])

const orders = ref([])
const ready = ref(true)
const loading = ref(true)
const errorMessage = ref('')

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
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        class="flex h-[min(88vh,760px)] w-full min-w-0 max-w-3xl flex-col rounded-[28px] border border-white/10 bg-zinc-900 p-4 shadow-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orders-title"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 id="orders-title" class="text-2xl font-extrabold text-white">Orders to suppliers</h2>
          <button class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </div>

        <p v-if="errorMessage" class="mb-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-300" role="alert">{{ errorMessage }}</p>

        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
          <p v-if="loading" class="py-10 text-center text-sm text-zinc-500">Loading…</p>
          <p v-else-if="!ready" class="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-300">{{ NOT_SET_UP }}</p>
          <OrdersTable v-else :orders="orders" @changed="load" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
