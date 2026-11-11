<script setup>
// Approval > Inspection Approvals: one row per inspection the staff
// submitted (every one here is submitted, so that isn't repeated); Approve
// or Reject decides it. @count says how many wait (the tab's number), also
// while another tab is open.
import { onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { usePagination } from '../lib/usePagination'
import { count } from '../lib/format'
import { toast } from '../lib/toast'
import TablePager from './TablePager.vue'
import NavIcon from './NavIcon.vue'

const emit = defineEmits(['count'])

const approvals = ref([])
// 10, 15 or all a page (the choice is remembered)
const inspectionsTop = ref(null)
const {
  page: inspectionsPageNo,
  pageSize: inspectionsPageSize,
  visible: inspectionsVisible,
} = usePagination(approvals, { storageKey: 'approvalInspections', scrollTarget: inspectionsTop })
const loading = ref(false)
const errorMessage = ref('')

async function fetchApprovals() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_submitted_approvals')

  if (error) {
    errorMessage.value = error.message
    approvals.value = []
  } else {
    approvals.value = data || []
  }

  loading.value = false
}

// Inspections being approved / rejected right now: their buttons are
// greyed out, so a double tap can't send the decision twice (the second
// one used to show 'already reviewed' after the first had worked).
const decidingIds = ref(new Set())

async function decideInspection(approval, rpc, params, doneText) {
  if (decidingIds.value.has(approval.id)) return

  errorMessage.value = ''
  decidingIds.value.add(approval.id)

  const { error } = await supabase.rpc(rpc, params)

  if (error) {
    decidingIds.value.delete(approval.id)
    // e.g. "Approved + Return cannot exceed product quantity"
    errorMessage.value = error.message
    return
  }

  await fetchApprovals()
  decidingIds.value.delete(approval.id)
  // "done" pops up at the top and goes by itself (lib/toast.js)
  toast(doneText)
}

function approveInspection(approval) {
  return decideInspection(approval, 'approve_inspection', {
    p_approval_id: approval.id,
    p_approved_qty: Number(approval.approved_qty || 0),
    p_return_qty: Number(approval.return_qty || 0),
  }, 'Inspection approved successfully.')
}

function rejectInspection(approval) {
  return decideInspection(approval, 'reject_inspection', {
    p_approval_id: approval.id,
  }, 'Inspection rejected.')
}

watch(() => approvals.value.length, (n) => emit('count', n), { immediate: true })

function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

onMounted(fetchApprovals)
</script>

<template>
  <section aria-label="Inspection approvals" class="space-y-4">
    <p v-if="errorMessage" class="msg msg-error" role="alert">{{ errorMessage }}</p>

    <div ref="inspectionsTop" class="list-card scroll-mt-4 border-white/10">
      <div class="list-head">
        <h2 class="list-title">Inspections to approve</h2>
        <span v-if="approvals.length > 0" class="list-count bg-red-600/20 text-red-400">{{ count(approvals.length) }}</span>
      </div>

      <!-- the table stays, headers and all, when it's empty -->
      <table class="data-table resp-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Requested by</th>
              <th>Date</th>
              <th>Approved</th>
              <th>Return</th>
              <th class="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="approvals.length === 0" class="empty-row">
              <td colspan="6">{{ loading ? 'Loading…' : 'Nothing to approve. Inspections the staff submit show here.' }}</td>
            </tr>
            <tr v-for="approval in inspectionsVisible" :key="approval.id">
              <td class="cell-main">
                <div class="flex min-w-0 items-center gap-3">
                  <span class="thumb bg-white/5 text-zinc-400">
                    <NavIcon name="approval" class="h-4 w-4" />
                  </span>
                  <p class="row-name cell-text text-white" :title="approval.product_name">{{ approval.product_name }}</p>
                </div>
              </td>
              <td data-label="Requested by">{{ approval.requested_by || 'Staff' }}</td>
              <td data-label="Date" class="whitespace-nowrap">{{ formatDate(approval.created_at) }}</td>
              <td data-label="Approved">
                <span class="chip-sm bg-emerald-600/15 text-emerald-400">{{ count(approval.approved_qty) }}</span>
              </td>
              <td data-label="Return">
                <span v-if="Number(approval.return_qty) > 0" class="chip-sm bg-red-600/15 text-red-400">{{ count(approval.return_qty) }}</span>
                <span v-else class="text-zinc-500">—</span>
              </td>
              <td class="cell-actions">
                <div class="row-actions">
                  <button
                    type="button"
                    class="btn-sm btn-approve"
                    :disabled="decidingIds.has(approval.id)"
                    @click="approveInspection(approval)"
                  >
                    {{ decidingIds.has(approval.id) ? 'Working…' : 'Approve' }}
                  </button>
                  <button
                    type="button"
                    class="btn-sm btn-reject"
                    :disabled="decidingIds.has(approval.id)"
                    @click="rejectInspection(approval)"
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <TablePager
          v-if="approvals.length > 0"
          v-model:page="inspectionsPageNo"
          v-model:page-size="inspectionsPageSize"
          :total="approvals.length"
          noun="inspections"
        />
    </div>
  </section>
</template>

<style scoped src="../styles/approvalLists.css"></style>
