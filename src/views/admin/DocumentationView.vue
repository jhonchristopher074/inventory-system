<template>
  <div>
    <PageHeader
      title="Documentation"
      subtitle="View receipts, inspection reports, and product reports."
    />

    <div class="mb-6 flex flex-wrap gap-3">
      <button
        v-for="type in documentTypes"
        :key="type"
        class="rounded-2xl px-5 py-3 font-bold transition"
        :class="selectedType === type
          ? 'bg-red-600 text-white'
          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'"
        @click="selectedType = type"
      >
        {{ type }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-zinc-400">
      Loading documents...
    </p>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <div
      v-if="!loading && filteredDocuments.length === 0"
      class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
    >
      No documents found.
    </div>

    <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="document in filteredDocuments"
        :key="document.id"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-xl"
      >
        <div
          class="mb-4 flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-black"
        >
          <img
            v-if="document.receipt_image_url || document.image_url"
            :src="document.receipt_image_url || document.image_url"
            class="h-full w-full object-cover"
          />

          <span v-else class="text-sm text-zinc-500">
            No Image
          </span>
        </div>

        <div class="mb-3 flex items-center justify-between gap-3">
          <span
            class="rounded-full px-3 py-1 text-xs font-bold"
            :class="badgeClass(document.type)"
          >
            {{ document.type || 'Document' }}
          </span>

          <span class="text-xs text-zinc-500">
            {{ formatDate(document.created_at) }}
          </span>
        </div>

        <h2 class="text-xl font-bold text-white">
          {{ document.title || document.type || 'Untitled Document' }}
        </h2>

        <p class="mt-2 line-clamp-3 text-sm text-zinc-400">
          {{ document.description || 'No description provided.' }}
        </p>

        <button
          class="mt-5 w-full rounded-2xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700"
          @click="openDocument(document)"
        >
          View Details
        </button>
      </div>
    </div>

    <!-- VIEW MODAL -->
    <div
      v-if="selectedDocument"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeDocument"
    >
      <div class="w-full max-w-2xl rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-2xl font-bold text-white">
              {{ selectedDocument.title || selectedDocument.type || 'Document Details' }}
            </h2>

            <p class="mt-1 text-sm text-zinc-400">
              {{ formatDate(selectedDocument.created_at) }}
            </p>
          </div>

          <button
            class="rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            @click="closeDocument"
          >
            ✕
          </button>
        </div>

        <div
          class="mb-4 flex max-h-[360px] items-center justify-center overflow-hidden rounded-2xl bg-black"
        >
          <img
            v-if="selectedDocument.receipt_image_url || selectedDocument.image_url"
            :src="selectedDocument.receipt_image_url || selectedDocument.image_url"
            class="max-h-[360px] w-full object-contain"
          />

          <span v-else class="p-10 text-sm text-zinc-500">
            No Image
          </span>
        </div>

        <div class="rounded-2xl bg-black p-4">
          <p class="mb-2 text-sm font-bold text-zinc-300">
            Type
          </p>

          <span
            class="inline-block rounded-full px-3 py-1 text-xs font-bold"
            :class="badgeClass(selectedDocument.type)"
          >
            {{ selectedDocument.type || 'Document' }}
          </span>

          <p class="mt-4 mb-2 text-sm font-bold text-zinc-300">
            Description
          </p>

          <p class="whitespace-pre-line text-sm leading-6 text-zinc-400">
            {{ selectedDocument.description || 'No description provided.' }}
          </p>
        </div>

        <button
          class="mt-5 w-full rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
          @click="closeDocument"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const documents = ref([])
const loading = ref(false)
const errorMessage = ref('')
const selectedType = ref('All')
const selectedDocument = ref(null)

const documentTypes = [
  'All',
  'Order Receipt',
  'Inspection Document',
  'Product Report',
]

onMounted(() => {
  fetchDocuments()
})

async function fetchDocuments() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('documentations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    errorMessage.value = error.message
    documents.value = []
  } else {
    documents.value = data || []
  }

  loading.value = false
}

const filteredDocuments = computed(() => {
  if (selectedType.value === 'All') {
    return documents.value
  }

  return documents.value.filter(document => {
    return document.type === selectedType.value
  })
})

function openDocument(document) {
  selectedDocument.value = document
}

function closeDocument() {
  selectedDocument.value = null
}

function badgeClass(type) {
  if (type === 'Order Receipt') {
    return 'bg-blue-600/20 text-blue-400'
  }

  if (type === 'Inspection Document') {
    return 'bg-emerald-600/20 text-emerald-400'
  }

  if (type === 'Product Report') {
    return 'bg-red-600/20 text-red-400'
  }

  return 'bg-zinc-700 text-zinc-300'
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