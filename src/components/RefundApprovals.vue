<template>
  <!-- Approval > Refunds (lib/refunds.js): the refunds of the last 7 days.
       Cashiers refund at the POS without approval; "Waiting" only shows a
       request left from before that (Approve / Reject). -->
  <section aria-label="Refunds" class="space-y-4">
    <p v-if="!ready" class="msg msg-error" role="alert">{{ NOT_SET_UP }}</p>
    <p v-if="error" class="msg msg-error" role="alert">{{ error }}</p>
    <p v-if="success" class="msg msg-ok">{{ success }}</p>

    <div v-if="waiting.length > 0" ref="waitingTop" class="list-card scroll-mt-4 border-sky-500/25">
      <div class="list-head">
        <h2 class="list-title">Waiting (from before)</h2>
        <span v-if="waiting.length" class="list-count bg-sky-500/15 text-sky-300">{{ count(waiting.length) }}</span>
        <span class="list-hint" title="Approve: the sale goes down and the pieces go back in stock. Reject: nothing changes.">
          From the cashiers
        </span>
      </div>

      <ul class="divide-y divide-white/5">
        <li v-for="request in waitingPage.visible.value" :key="request.id" class="px-4 py-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-bold text-white">
                Sale #{{ request.sale_id }} · <span class="text-amber-300">{{ peso(request.amount) }}</span>
              </p>
              <p class="mt-0.5 text-sm text-zinc-300">
                Sent by cashier <b class="text-white">{{ request.requested_by_name || 'Unknown' }}</b>
              </p>
              <p class="text-xs text-zinc-500">
                Asked {{ dayAndTime(request.created_at) }}
                <template v-if="request.sale_created_at"> · sold {{ dayAndTime(request.sale_created_at) }}</template>
              </p>
            </div>
            <div v-if="rejecting !== request.id" class="flex shrink-0 gap-2">
              <button type="button" class="btn-sm btn-reject" :disabled="busy" @click="startReject(request)">
                Reject
              </button>
              <button type="button" class="btn-sm btn-approve" :disabled="busy" @click="decide(request, true)">
                {{ busy === request.id ? 'Saving…' : 'Approve' }}
              </button>
            </div>
          </div>

          <ul class="mt-2 space-y-1 text-sm">
            <li v-for="item in request.items" :key="item.id" class="flex justify-between gap-3 text-zinc-300">
              <span class="min-w-0 truncate">{{ count(item.quantity) }} × {{ item.product_name }}</span>
              <span class="shrink-0 tabular-nums text-zinc-400">{{ peso(item.amount) }}</span>
            </li>
          </ul>

          <p v-if="request.note" class="mt-2 rounded-lg bg-white/5 p-2 text-sm text-zinc-300">
            <b class="text-zinc-400">Why:</b> {{ request.note }}
          </p>

          <!-- Reject: an optional reason, then confirm -->
          <form v-if="rejecting === request.id" class="mt-3 flex flex-col gap-2 sm:flex-row" @submit.prevent="decide(request, false)">
            <input
              v-model="reason"
              type="text"
              maxlength="200"
              autocomplete="off"
              placeholder="Reason for the cashier (optional)"
              aria-label="Reason for rejecting"
              class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-red-400"
              :disabled="busy"
            />
            <div class="flex gap-2">
              <button type="button" class="btn-sm bg-zinc-800 text-white hover:bg-zinc-700" :disabled="busy" @click="rejecting = null">Back</button>
              <button type="submit" class="btn-sm bg-red-600 text-white hover:bg-red-700" :disabled="busy">
                {{ busy === request.id ? 'Saving…' : 'Yes, reject' }}
              </button>
            </div>
          </form>
        </li>
      </ul>
      <TablePager
        v-if="waiting.length > 0"
        v-model:page="waitingPage.page.value"
        v-model:page-size="waitingPage.pageSize.value"
        :total="waiting.length"
        noun="requests"
      />
    </div>

    <!-- the last 7 days -->
    <div ref="decidedTop" class="list-card scroll-mt-4 border-white/10">
      <div class="list-head">
        <h2 class="list-title">Refunds</h2>
        <span class="list-hint" title="Cashiers refund at the POS; the sale goes down and the pieces go back in stock. Every refund is kept in Documentation › Refunded.">
          Last 7 days
        </span>
      </div>
      <p v-if="decided.length === 0" class="list-empty">No refunds in the last 7 days.</p>
      <ul v-else class="divide-y divide-white/5">
        <li v-for="request in decidedPage.visible.value" :key="request.id" class="row">
          <div class="row-main">
            <p class="row-name text-white">Sale #{{ request.sale_id }} · {{ peso(request.amount) }}</p>
            <p class="row-sub text-zinc-500">
              {{ request.items.map((item) => `${item.quantity} × ${item.product_name}`).join(', ') }}
              · by {{ request.requested_by_name || 'cashier' }} · {{ dayAndTime(request.decided_at) }}
              <template v-if="request.note"> · {{ request.note }}</template>
              <template v-if="request.reject_reason"> · {{ request.reject_reason }}</template>
            </p>
          </div>
          <span class="chip-sm shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" :class="STATUS[request.status]?.tone">
            {{ request.status === 'approved' ? 'Refunded' : 'Rejected' }}
          </span>
        </li>
      </ul>
      <TablePager
        v-if="decided.length > 0"
        v-model:page="decidedPage.page.value"
        v-model:page-size="decidedPage.pageSize.value"
        :total="decided.length"
        noun="refunds"
      />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { count, dayAndTime, peso } from '../lib/format'
import { NOT_SET_UP, STATUS, decideRefund, piecesOf, recent } from '../lib/refunds'
import { usePagination } from '../lib/usePagination'
import TablePager from './TablePager.vue'

const props = defineProps({
  refunds: { type: Array, default: () => [] },
  ready: { type: Boolean, default: true },
})

const emit = defineEmits(['changed'])

const waiting = computed(() => props.refunds.filter((request) => request.status === 'pending'))
const decided = computed(() => recent(props.refunds).filter((request) => request.status !== 'pending'))

// one page at a time (10, 15 or all; the choice is remembered)
const waitingTop = ref(null)
const decidedTop = ref(null)
const waitingPage = usePagination(waiting, { storageKey: 'refundsWaiting', scrollTarget: waitingTop })
const decidedPage = usePagination(decided, { storageKey: 'refundsDecided', scrollTarget: decidedTop })

const busy = ref(null) // the request being saved
const rejecting = ref(null)
const reason = ref('')
const error = ref('')
const success = ref('')

function startReject(request) {
  error.value = ''
  reason.value = ''
  rejecting.value = request.id
}

async function decide(request, approve) {
  if (busy.value) return
  busy.value = request.id
  error.value = ''
  success.value = ''

  try {
    await decideRefund(request.id, approve, approve ? '' : reason.value.trim())
    rejecting.value = null
    success.value = approve
      ? `Refunded ${peso(request.amount)} from sale #${request.sale_id}: ${count(piecesOf(request))} pcs back in stock.`
      : `Rejected the refund for sale #${request.sale_id}. The cashier was told.`
    emit('changed')
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = null
  }
}
</script>

<style scoped src="../styles/approvalLists.css"></style>
