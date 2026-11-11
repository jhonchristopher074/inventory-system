<script setup>
// Reorder list (Inventory > Low stock): the products running low, by
// supplier, with how many to order (lib/reorder.js). Only a suggestion:
// Copy puts the list on the clipboard, Email opens the owner's own mail app
// with it filled in. Nothing is ordered or sent from here.
//
//   <ReorderListModal :fallback="lowProducts" @close="..." />
// fallback: the low products Inventory already has, used when the
// database can't say who supplies them (no admin_reorder_candidates).
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { listSales } from '../lib/salesQuery'
import { LOW_STOCK } from '../lib/stock'
import { MIN_AFTER_ORDER, bySupplier, orderEmailLink, orderText, soldByProduct } from '../lib/reorder'
import { count, dayAndTime } from '../lib/format'
import HelpTip from './HelpTip.vue'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  fallback: { type: Array, default: () => [] },
})
const emit = defineEmits(['close'])

const groups = ref([])
const loading = ref(true)
const errorMessage = ref('')
const copied = ref('') // the group just copied ('all' for every one)
let copiedTimer = null

const productCount = computed(() => groups.value.reduce((n, group) => n + group.items.length, 0))

async function lowProducts() {
  const { data, error } = await supabase.rpc('admin_reorder_candidates', { p_low: LOW_STOCK })
  if (!error && Array.isArray(data?.products)) return data.products
  return props.fallback
}

async function soldLast30Days() {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
  try {
    return soldByProduct(await listSales({ from }))
  } catch (err) {
    // without the sales the suggestion is just "back to 20"
    console.error(err)
    return new Map()
  }
}

onMounted(async () => {
  try {
    const [products, sold] = await Promise.all([lowProducts(), soldLast30Days()])
    groups.value = bySupplier(products, sold)
  } catch (err) {
    errorMessage.value = err.message || "Couldn't load the low products."
  } finally {
    loading.value = false
  }
})

function fixQty(item) {
  item.qty = Math.min(Math.max(Math.floor(Number(item.qty) || 0), 0), 9999)
}

function lastOrderText(order) {
  if (!order) return ''
  if (order.status === 'sent') return `Ordered ${dayAndTime(order.at)} · ${count(order.qty)} pcs`
  if (order.status === 'failed') return 'An order was not sent'
  return 'An order is waiting to be sent'
}

async function copy(text, which) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = which
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = ''), 2000)
  } catch {
    errorMessage.value = "Couldn't copy. Select the list and copy it by hand."
  }
}

function copyGroup(group) {
  copy(orderText(group), group.key)
}

function copyAll() {
  const text = groups.value
    .map((group) => `${group.name}${group.email ? ` <${group.email}>` : ''}\n${orderText(group)}`)
    .join('\n\n----------\n\n')
  copy(text, 'all')
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
        aria-labelledby="reorder-title"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <h2 id="reorder-title" class="text-2xl font-extrabold text-white">Reorder list</h2>
            <span v-if="!loading" class="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-300">
              {{ count(productCount) }}
            </span>
            <HelpTip
              :text="`Products with ${LOW_STOCK} or fewer left, by supplier. The pieces are a suggestion: enough for the last 30 days' sales, and at least ${MIN_AFTER_ORDER} in stock after. Nothing is sent from here: copy the list, or email it from your own mail app.`"
            />
          </div>
          <button
            class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <p v-if="errorMessage" class="mb-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
          {{ errorMessage }}
        </p>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <p v-if="loading" class="py-10 text-center text-sm text-zinc-500">Loading…</p>
          <p v-else-if="groups.length === 0" class="py-10 text-center text-sm text-zinc-500">
            Nothing is running low.
          </p>

          <section
            v-for="group in groups"
            :key="group.key"
            class="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
          >
            <header class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate font-bold" :class="group.key === 'none' ? 'italic text-zinc-400' : 'text-white'">
                  {{ group.name }}
                </p>
                <p v-if="group.email" class="truncate text-xs text-zinc-500">{{ group.email }}</p>
              </div>
              <div class="flex shrink-0 gap-2">
                <button type="button" class="act-btn" @click="copyGroup(group)">
                  <NavIcon name="docs" class="h-3.5 w-3.5" />
                  {{ copied === group.key ? 'Copied' : 'Copy' }}
                </button>
                <a v-if="group.email" class="act-btn" :href="orderEmailLink(group)">
                  <NavIcon name="mail" class="h-3.5 w-3.5" />
                  Email
                </a>
              </div>
            </header>

            <table class="w-full text-sm">
              <thead class="text-left text-[0.68rem] font-bold uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th class="px-4 py-2">Product</th>
                  <th class="px-2 py-2 text-right">Stock</th>
                  <th class="hidden px-2 py-2 text-right sm:table-cell">Sold · 30 days</th>
                  <th class="px-4 py-2 text-right">Order</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in group.items" :key="item.id" class="border-t border-white/5">
                  <td class="px-4 py-2.5">
                    <p class="font-semibold text-zinc-100">{{ item.name }}</p>
                    <p v-if="item.lastOrder" class="text-xs text-sky-300">{{ lastOrderText(item.lastOrder) }}</p>
                    <p v-else-if="item.category" class="text-xs text-zinc-500">{{ item.category }}</p>
                  </td>
                  <td class="px-2 py-2.5 text-right font-bold" :class="item.stock <= 0 ? 'text-red-400' : 'text-yellow-300'">
                    {{ count(item.stock) }}
                  </td>
                  <td class="hidden px-2 py-2.5 text-right text-zinc-400 sm:table-cell">{{ count(item.sold) }}</td>
                  <td class="px-4 py-2.5 text-right">
                    <label class="sr-only" :for="`reorder-${group.key}-${item.id}`">Pieces of {{ item.name }} to order</label>
                    <input
                      :id="`reorder-${group.key}-${item.id}`"
                      v-model.number="item.qty"
                      type="number"
                      min="0"
                      max="9999"
                      class="w-20 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-right text-sm font-bold text-white outline-none focus:border-yellow-400"
                      @blur="fixQty(item)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <div v-if="groups.length > 1" class="mt-4 flex justify-end">
          <button type="button" class="act-btn" @click="copyAll">
            <NavIcon name="docs" class="h-3.5 w-3.5" />
            {{ copied === 'all' ? 'Copied' : 'Copy all' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.act-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(234, 179, 8, 0.35);
  padding: 0.4rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #fde047;
}

.act-btn:hover {
  background: rgba(234, 179, 8, 0.12);
  color: #fff;
}
</style>
