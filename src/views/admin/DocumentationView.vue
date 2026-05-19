<template>
  <div>
    <PageHeader
      title="Documentation"
      subtitle="View receipts, inspection reports, and sales documents."
    />

    <!-- CATEGORY FILTER -->
    <div class="mb-6 flex gap-3 overflow-x-auto pb-2">
      <button
        v-for="category in categories"
        :key="category"
        class="rounded-full px-4 py-2 text-sm font-bold transition"
        :class="
          selectedCategory === category
            ? 'bg-red-600 text-white'
            : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
        "
        @click="selectedCategory = category"
      >
        {{ category }}
      </button>
    </div>

    <!-- LOADING -->
    <p v-if="loading" class="text-zinc-400">Loading documents...</p>

    <!-- ERROR -->
    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
      {{ errorMessage }}
    </p>

    <!-- EMPTY -->
    <div v-if="!loading && filteredDocs.length === 0" class="text-zinc-500">
      No documents found.
    </div>

    <!-- DOCUMENT GRID -->
    <div class="grid grid-cols-[repeat(auto-fill,260px)] gap-5">
      <div
        v-for="doc in filteredDocs"
        :key="doc.id"
        class="cursor-pointer rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-xl transition hover:-translate-y-1"
        @click="openDoc(doc)"
      >
        <img
          :src="doc.receipt_image_url || 'https://via.placeholder.com/400x250'"
          class="mb-3 h-36 w-full rounded-xl object-cover"
        />

        <h2 class="text-lg font-bold text-white">{{ doc.title }}</h2>
        <p class="text-sm text-red-400">{{ doc.type }}</p>

        <p class="mt-2 line-clamp-2 text-sm text-zinc-400">
          {{ doc.description }}
        </p>
      </div>
    </div>

    <!-- DOCUMENT MODAL -->
    <div
      v-if="selectedDoc"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="selectedDoc = null"
    >
      <div class="w-full max-w-2xl rounded-[26px] border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        
        <!-- HEADER -->
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-white">
              {{ selectedDoc.title }}
            </h2>
            <p class="text-sm text-red-400">
              {{ selectedDoc.type }}
            </p>
          </div>

          <button
            class="rounded-full bg-black px-4 py-2 text-xl text-white hover:bg-red-600"
            @click="selectedDoc = null"
          >
            &times;
          </button>
        </div>

        <!-- IMAGE (CLICKABLE) -->
        <img
          :src="selectedDoc.receipt_image_url || 'https://via.placeholder.com/600x400'"
          class="mb-4 h-72 w-full cursor-zoom-in rounded-2xl object-cover"
          @click="previewImage = selectedDoc.receipt_image_url"
        />

        <!-- DESCRIPTION -->
        <div class="rounded-2xl border border-white/10 bg-black p-4">
          <p class="mb-2 text-sm font-bold text-zinc-400">Description</p>
          <p class="text-zinc-300">
            {{ selectedDoc.description }}
          </p>
        </div>

      </div>
    </div>

    <!-- 🔥 FULL IMAGE PREVIEW -->
    <div
      v-if="previewImage"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
      @click.self="previewImage = null"
    >
      <button
        class="absolute right-6 top-6 rounded-full bg-zinc-900 px-4 py-2 text-2xl text-white hover:bg-red-600"
        @click="previewImage = null"
      >
        &times;
      </button>

      <img
        :src="previewImage"
        class="max-h-[90vh] max-w-[95vw] rounded-2xl object-contain"
      />
    </div>

  <!-- FULL IMAGE PREVIEW -->
<div
  v-if="previewImage"
  class="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
  @click.self="previewImage = null"
>
  <button
    class="absolute right-6 top-6 rounded-full bg-zinc-900 px-4 py-2 text-2xl text-white hover:bg-red-600"
    @click="previewImage = null"
  >
    ×
  </button>

  <img
    :src="previewImage"
    class="max-h-[90vh] max-w-[95vw] rounded-2xl object-contain"
  />
</div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const docs = ref([])
const selectedDoc = ref(null)
const previewImage = ref(null)

const selectedCategory = ref('All')
const loading = ref(false)
const errorMessage = ref('')

const categories = [
  'All',
  'Order Receipt',
  'Inspection Document',
  'Sale Document'
]

const filteredDocs = computed(() => {
  if (selectedCategory.value === 'All') return docs.value
  return docs.value.filter(d => d.type === selectedCategory.value)
})

async function fetchDocs() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('documentations')
    .select('*')
    .order('id', { ascending: false })

    console.log('DOCS DATA:', data)
    console.log('DOCS ERROR:', error)

  if (error) {
    errorMessage.value = error.message
  } else {
    docs.value = data || []
  }

  loading.value = false
}

function openDoc(doc) {
  selectedDoc.value = doc
}

onMounted(fetchDocs)
</script>