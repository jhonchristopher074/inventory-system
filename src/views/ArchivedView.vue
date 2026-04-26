<template>
  <div class="flex gap-5">
    <div class="flex-1">
      <PageHeader
      title="Archived"
      subtitle="Drag archived products to restore them or hide them from the web."
      />

      <p v-if="loading" class="text-zinc-400">Loading archived products...</p>

      <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
        {{ errorMessage }}
      </p>

      <div v-if="!loading && archivedProducts.length === 0" class="text-zinc-500">
        No archived products.
      </div>

      <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
        <div
          v-for="product in archivedProducts"
          :key="product.id"
          draggable="true"
          class="min-h-[298px] cursor-grab rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl transition hover:-translate-y-1 active:cursor-grabbing"
          @dragstart="startDrag(product)"
        >
          <img
            :src="product.image_url || 'https://via.placeholder.com/300x200'"
            :alt="product.name"
            class="mb-3 h-[155px] w-full rounded-2xl object-cover"
          />

          <h3 class="mb-2 text-2xl font-bold text-white">{{ product.name }}</h3>
          <p class="text-zinc-400">{{ product.category }}</p>
          <p class="mt-2 text-zinc-300">Qty: {{ product.quantity }}</p>
        </div>
      </div>
    </div>

    <aside class="sticky top-5 h-fit w-[280px] shrink-0">
      <div class="space-y-4 rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <div>
          <h2 class="text-2xl font-bold text-white">Archive Actions</h2>
          <p class="text-sm text-zinc-400">Sticky drag area</p>
        </div>

        <div
          class="flex min-h-[135px] items-center justify-center rounded-[20px] border-2 border-dashed border-emerald-500 bg-emerald-500/10 p-4 text-center transition"
          :class="restoreDragOver ? 'scale-[1.02] bg-emerald-500/20' : ''"
          @dragover.prevent="restoreDragOver = true"
          @dragleave="restoreDragOver = false"
          @drop="openRestoreModal"
        >
          <div>
            <strong class="mb-1 block text-lg text-white">Back to Inventory</strong>
            <span class="text-sm text-emerald-200">Drop here to restore</span>
          </div>
        </div>

        <div
          class="flex min-h-[135px] items-center justify-center rounded-[20px] border-2 border-dashed border-red-500 bg-red-500/10 p-4 text-center transition"
          :class="deleteDragOver ? 'scale-[1.02] bg-red-500/20' : ''"
          @dragover.prevent="deleteDragOver = true"
          @dragleave="deleteDragOver = false"
          @drop="openDeleteModal"
        >
          <div>
            <strong class="mb-1 block text-lg text-white">Deletion Box</strong>
            <span class="text-sm text-red-200">Drop here to hide</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- Custom Proceed Modal -->
    <div
      v-if="actionModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeActionModal"
    >
      <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="mb-3 text-xl font-bold text-white">{{ actionTitle }}</h2>

        <p class="mb-2 text-sm text-zinc-300">
          <b>Product:</b> {{ draggedProduct?.name }}
        </p>

        <p class="mb-4 text-sm text-zinc-300">
          {{ actionMessage }}
        </p>

        <p v-if="modalError" class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400">
          {{ modalError }}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700"
            @click="confirmAction"
          >
            Proceed
          </button>

          <button
            class="w-full rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            @click="closeActionModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader.vue'

const archivedProducts = ref([])
const draggedProduct = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const restoreDragOver = ref(false)
const deleteDragOver = ref(false)

const actionModal = ref(false)
const actionType = ref('')
const modalError = ref('')

const actionTitle = computed(() => {
  if (actionType.value === 'restore') return 'Restore Product'
  if (actionType.value === 'delete') return 'Remove Product'
  return 'Confirm Action'
})

const actionMessage = computed(() => {
  if (actionType.value === 'restore') {
    return 'This item will be moved back to Inventory.'
  }

  if (actionType.value === 'delete') {
    return 'This item will be hidden from the system. It will not be visible on the web.'
  }

  return ''
})

async function fetchArchivedProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', true)
    .eq('is_deleted', false)
    .order('id', { ascending: true })

  if (error) {
    errorMessage.value = error.message
  } else {
    archivedProducts.value = data || []
  }

  loading.value = false
}

function startDrag(product) {
  draggedProduct.value = product
}

function openRestoreModal() {
  restoreDragOver.value = false
  if (!draggedProduct.value) return

  actionType.value = 'restore'
  modalError.value = ''
  actionModal.value = true
}

function openDeleteModal() {
  deleteDragOver.value = false
  if (!draggedProduct.value) return

  actionType.value = 'delete'
  modalError.value = ''
  actionModal.value = true
}

function closeActionModal() {
  actionModal.value = false
  actionType.value = ''
  modalError.value = ''
}

async function confirmAction() {
  if (!draggedProduct.value) return

  let updateData = {}

  if (actionType.value === 'restore') {
    updateData = {
      is_archived: false,
      is_deleted: false,
    }
  }

  if (actionType.value === 'delete') {
    updateData = {
      is_deleted: true,
    }
  }

  const { error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', draggedProduct.value.id)

  if (error) {
    modalError.value = error.message
    return
  }

  if (actionType.value === 'restore') {
    await supabase.from('notifications').insert({
      title: 'Product Restored',
      message: `${draggedProduct.value.name} was brought back to Inventory.`,
      type: 'restore',
      product_id: draggedProduct.value.id,
    })
  }

  actionModal.value = false
  actionType.value = ''
  draggedProduct.value = null
  await fetchArchivedProducts()
}

onMounted(fetchArchivedProducts)
</script>