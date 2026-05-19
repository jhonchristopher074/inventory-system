<template>
  <div>
    <PageHeader
      title="Approval"
      subtitle="Review and approve staff inspection requests."
    />

    <p v-if="loading" class="text-sm text-zinc-400">Loading approvals...</p>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="successMessage"
      class="mb-4 rounded-xl bg-emerald-600/20 p-4 text-emerald-400"
    >
      {{ successMessage }}
    </p>

    <div
      v-if="!loading && approvals.length === 0"
      class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
    >
      No pending inspection approvals.
    </div>

    <div v-else class="space-y-5">
      <div
        v-for="approval in approvals"
        :key="approval.id"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-white">
              {{ approval.product_name }}
            </h2>

            <p class="mt-1 text-sm text-zinc-400">
              Requested by: {{ approval.requested_by || 'Staff' }}
            </p>

            <p class="mt-1 text-sm text-zinc-400">
              Date: {{ formatDate(approval.created_at) }}
            </p>

            <div class="mt-4 flex flex-wrap gap-2">
              <span class="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-400">
                Approved: {{ approval.approved_qty || 0 }}
              </span>

              <span class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400">
                Return: {{ approval.return_qty || 0 }}
              </span>

              <span class="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold text-yellow-400">
                Pending
              </span>
            </div>
          </div>
        </div>

        <div class="mt-5 flex gap-3">
          <button
            class="rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700"
            @click="approveInspection(approval)"
          >
            Approve
          </button>

          <button
            class="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700"
            @click="rejectInspection(approval)"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const approvals = ref([])
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(() => {
  fetchApprovals()
})

async function fetchApprovals() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const { data, error } = await supabase
    .from('inspection_approvals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    errorMessage.value = error.message
    approvals.value = []
  } else {
    approvals.value = data || []
  }

  loading.value = false
}

async function approveInspection(approval) {
  errorMessage.value = ''
  successMessage.value = ''

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('id', approval.product_id)
    .single()

  if (productError) {
    errorMessage.value = productError.message
    return
  }

  const newApproved =
    Number(product.approved_count || 0) + Number(approval.approved_qty || 0)

  const newReturn =
    Number(product.return_count || 0) + Number(approval.return_qty || 0)

  if (newApproved + newReturn > Number(product.quantity || 0)) {
    errorMessage.value = 'Approved + Return cannot exceed product quantity.'
    return
  }

  const { error: productUpdateError } = await supabase
    .from('products')
    .update({
      approved_count: newApproved,
      return_count: newReturn,
      inspection_result: newReturn > 0 ? 'return' : 'approved',
    })
    .eq('id', approval.product_id)

  if (productUpdateError) {
    errorMessage.value = productUpdateError.message
    return
  }

  const { error: approvalUpdateError } = await supabase
    .from('inspection_approvals')
    .update({
      status: 'approved',
    })
    .eq('id', approval.id)

  if (approvalUpdateError) {
    errorMessage.value = approvalUpdateError.message
    return
  }

  await supabase.from('notifications').insert({
    title: 'Inspection Approved',
    message: `${approval.product_name} inspection was approved by admin.`,
    type: 'inspection',
    product_id: approval.product_id,
    is_read: false,
  })

  successMessage.value = 'Inspection approved successfully.'
  await fetchApprovals()
}

async function rejectInspection(approval) {
  errorMessage.value = ''
  successMessage.value = ''

  const { error } = await supabase
    .from('inspection_approvals')
    .update({
      status: 'rejected',
    })
    .eq('id', approval.id)

  if (error) {
    errorMessage.value = error.message
    return
  }

  await supabase.from('notifications').insert({
    title: 'Inspection Rejected',
    message: `${approval.product_name} inspection was rejected by admin.`,
    type: 'inspection',
    product_id: approval.product_id,
    is_read: false,
  })

  successMessage.value = 'Inspection rejected.'
  await fetchApprovals()
}

function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>