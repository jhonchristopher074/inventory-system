<script setup>
// One order to a supplier, opened (the row's drop-down in OrdersTable.vue):
// the progress (sent > supplier's answer > goods in), the products, the
// details and what can be done next.
//
//   <OrderDetails :order="order" @changed="reload" />
//   changed: the order was cancelled, completed or emailed again
import { computed, ref } from 'vue'
import { cancelOrder, completeOrder, orderPieces, resendOrderEmail } from '../lib/orders'
import { count, dayAndTime } from '../lib/format'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  order: { type: Object, required: true },
})
const emit = defineEmits(['changed'])

const busy = ref(false)
const message = ref(null) // { ok, text }

const status = computed(() => props.order.order_status || 'requested')
const pieces = computed(() => orderPieces(props.order))

// "Nov 28" from 2026-11-28 or a timestamp
function day(value) {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// "Thu, Nov 26, 2026" from 2026-11-26
function longDay(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// sent > supplier's answer > goods in: { label, sub, mark: done | now | no | later }
const steps = computed(() => {
  const order = props.order
  const s = status.value
  const sent = { label: 'Sent', sub: day(order.created_at), mark: 'done' }
  if (s === 'cancelled') return [sent, { label: 'Cancelled', sub: day(order.closed_at), mark: 'no' }]
  if (s === 'declined') return [sent, { label: 'Declined', sub: day(order.responded_at), mark: 'no' }]
  const answer =
    s === 'requested'
      ? { label: 'Supplier answer', sub: 'waiting', mark: 'now' }
      : { label: 'Accepted', sub: day(order.responded_at), mark: 'done' }
  const goods =
    s === 'completed'
      ? { label: 'Goods in', sub: day(order.closed_at), mark: 'done' }
      : s === 'accepted'
        ? { label: 'Goods in', sub: order.expected_date ? `due ${day(order.expected_date)}` : '', mark: 'now' }
        : { label: 'Goods in', sub: '', mark: 'later' }
  return [sent, answer, goods]
})

// the email, in words
const email = computed(() => {
  const order = props.order
  if (order.status === 'sent') return { text: `Emailed ${order.sent_at ? dayAndTime(order.sent_at) : ''}`, tone: 'text-emerald-400' }
  if (order.status === 'failed') return { text: `Not emailed: ${order.error || 'unknown reason'}`, tone: 'text-red-300' }
  if (order.status === 'to_send') return { text: 'Email waiting to be sent', tone: 'text-zinc-400' }
  return null
})

async function act(what) {
  if (busy.value) return
  busy.value = true
  message.value = null
  const id = props.order.id
  try {
    if (what === 'cancel') {
      await cancelOrder(id)
    } else if (what === 'complete') {
      await completeOrder(id)
    } else if (what === 'email') {
      const { sent, reason } = await resendOrderEmail(id)
      if (!sent) message.value = { ok: false, text: `Still not emailed: ${reason}` }
    }
    emit('changed', id)
  } catch (err) {
    message.value = { ok: false, text: err.message }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- progress -->
    <ol class="flex items-start" aria-label="Progress">
      <li v-for="(step, i) in steps" :key="step.label" class="step" :class="`step-${step.mark}`">
        <span v-if="i > 0" class="step-line" aria-hidden="true" />
        <span class="step-dot" aria-hidden="true">
          <NavIcon v-if="step.mark === 'done'" name="check" class="h-3 w-3" />
          <span v-else-if="step.mark === 'no'" class="text-[0.7rem] font-black leading-none">✕</span>
        </span>
        <span class="mt-1 block text-[0.72rem] font-bold text-zinc-200">{{ step.label }}</span>
        <span v-if="step.sub" class="block text-[0.68rem] text-zinc-500">{{ step.sub }}</span>
      </li>
    </ol>

    <!-- products -->
    <table class="w-full overflow-hidden rounded-xl text-sm">
      <thead class="bg-white/[0.03] text-left text-[0.66rem] font-bold uppercase tracking-[0.12em] text-zinc-500">
        <tr>
          <th class="px-3 py-1.5">Product</th>
          <th class="hidden px-3 py-1.5 text-right sm:table-cell">Stock then</th>
          <th class="px-3 py-1.5 text-right">Ordered</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, i) in order.items" :key="i" class="border-t border-white/5">
          <td class="px-3 py-1.5 text-zinc-200">{{ item.product_name }}</td>
          <td class="hidden px-3 py-1.5 text-right text-zinc-500 sm:table-cell">
            {{ item.stock_then == null ? '—' : count(item.stock_then) }}
          </td>
          <td class="px-3 py-1.5 text-right font-bold text-white">{{ count(item.qty) }} pcs</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="border-t border-white/10">
          <td class="px-3 py-1.5 text-xs font-bold text-zinc-400">Total</td>
          <td class="hidden sm:table-cell" />
          <td class="px-3 py-1.5 text-right font-extrabold text-white">{{ count(pieces) }} pcs</td>
        </tr>
      </tfoot>
    </table>

    <!-- details -->
    <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
      <dt class="text-zinc-500">Supplier</dt>
      <dd class="text-zinc-200">{{ order.supplier_name }}<span v-if="order.supplier_email" class="text-zinc-500"> · {{ order.supplier_email }}</span></dd>
      <template v-if="order.created_by_name">
        <dt class="text-zinc-500">Ordered by</dt>
        <dd class="text-zinc-200">{{ order.created_by_name }}</dd>
      </template>
      <template v-if="order.note">
        <dt class="text-zinc-500">Your note</dt>
        <dd class="text-zinc-200">{{ order.note }}</dd>
      </template>
      <template v-if="order.expected_date">
        <dt class="text-zinc-500">Delivery</dt>
        <dd class="font-bold text-emerald-300">{{ longDay(order.expected_date) }} · on the Calendar</dd>
      </template>
      <template v-if="order.supplier_reply">
        <dt class="text-zinc-500">Supplier says</dt>
        <dd class="text-zinc-200">{{ order.supplier_reply }}</dd>
      </template>
      <template v-if="email">
        <dt class="text-zinc-500">Email</dt>
        <dd :class="email.tone">{{ email.text }}</dd>
      </template>
    </dl>

    <p v-if="message" class="rounded-lg px-3 py-2 text-xs font-bold" :class="message.ok ? 'bg-emerald-600/15 text-emerald-300' : 'bg-red-600/15 text-red-300'" role="status">
      {{ message.text }}
    </p>

    <!-- what can be done next -->
    <div v-if="status === 'requested' || status === 'accepted'" class="flex flex-wrap gap-2">
      <button v-if="status === 'requested' && order.status === 'failed'" type="button" class="act-btn" :disabled="busy" @click="act('email')">
        <NavIcon name="mail" class="h-3.5 w-3.5" /> Send email again
      </button>
      <button v-if="status === 'accepted'" type="button" class="act-btn act-good" :disabled="busy" @click="act('complete')">
        <NavIcon name="check" class="h-3.5 w-3.5" /> Goods are in: mark completed
      </button>
      <button v-if="status === 'requested'" type="button" class="act-btn act-bad" :disabled="busy" @click="act('cancel')">
        Cancel order
      </button>
    </div>
  </div>
</template>

<style scoped>
/* progress */
.step {
  position: relative;
  flex: 1;
  min-width: 0;
  text-align: center;
}

.step-line {
  position: absolute;
  top: 0.6rem;
  right: 50%;
  left: -50%;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
}

.step-done .step-line,
.step-now .step-line {
  background: rgba(52, 211, 153, 0.5);
}

.step-no .step-line {
  background: rgba(244, 52, 76, 0.5);
}

.step-dot {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  background: var(--color-zinc-900);
  color: #fff;
}

.step-done .step-dot {
  border-color: var(--color-emerald-500);
  background: var(--color-emerald-500);
}

.step-now .step-dot {
  border-color: var(--color-sky-400);
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.15);
}

.step-no .step-dot {
  border-color: var(--color-red-500);
  background: var(--color-red-500);
}

.act-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 0.65rem;
  border: 1px solid var(--hairline);
  background: var(--color-zinc-800);
  padding: 0.4rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #fff;
}

.act-btn:hover:not(:disabled) {
  background: var(--color-zinc-700);
}

.act-btn:disabled {
  opacity: 0.5;
}

.act-good {
  border-color: rgba(52, 211, 153, 0.4);
  color: var(--color-emerald-400);
}

.act-bad {
  border-color: rgba(244, 52, 76, 0.4);
  color: var(--color-red-400);
}
</style>
