<template>
  <div>
    <PageHeader
      title="Documentation"
      subtitle="View receipts, inspection reports, product reports and staff documentation."
    />

    <div class="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:mb-6 sm:flex-wrap sm:gap-3 sm:overflow-visible">
      <button
        v-for="type in documentTypes"
        :key="type"
        class="shrink-0 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-bold transition sm:px-5 sm:py-3 sm:text-base"
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

    <div class="grid gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="document in visibleDocuments"
        :key="document.id"
        class="rounded-2xl border border-white/10 bg-zinc-900 p-3 shadow-xl sm:rounded-[24px] sm:p-5"
      >
        <div
          class="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-xl bg-black sm:mb-4 sm:h-40 sm:rounded-2xl"
        >
          <img
            v-if="document.receipt_image_url || document.image_url"
            :src="document.receipt_image_url || document.image_url"
            loading="lazy"
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

        <h2 class="text-base font-bold text-white sm:text-xl">
          {{ document.title || document.type || 'Untitled Document' }}
        </h2>

        <p class="mt-2 line-clamp-3 text-sm text-zinc-400">
          {{ document.description || 'No description provided.' }}
        </p>

        <button
          class="mt-3 w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 sm:mt-5 sm:rounded-2xl sm:py-3 sm:text-base"
          @click="openDocument(document)"
        >
          View Details
        </button>
      </div>
    </div>

    <!-- LAZY LOADING: when this line comes near the screen, the next 15 items are shown -->
    <div
      v-if="hasMore"
      ref="sentinel"
      class="py-8 text-center text-sm text-zinc-500"
    >
      Loading more...
    </div>

    <p
      v-else-if="filteredDocuments.length > PAGE_SIZE"
      class="py-6 text-center text-xs text-zinc-600"
    >
      All {{ filteredDocuments.length }} documents shown.
    </p>

    <!-- VIEW MODAL -->
    <div
      v-if="selectedDocument"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeDocument"
    >
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:rounded-[24px] sm:p-5">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-white sm:text-2xl">
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
          class="mb-4 flex max-h-[260px] sm:max-h-[360px] items-center justify-center overflow-hidden rounded-2xl bg-black"
        >
          <img
            v-if="selectedDocument.receipt_image_url || selectedDocument.image_url"
            :src="selectedDocument.receipt_image_url || selectedDocument.image_url"
            class="max-h-[260px] w-full object-contain sm:max-h-[360px]"
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const documents = ref([])
const loading = ref(false)
const errorMessage = ref('')
const selectedType = ref('All')
const selectedDocument = ref(null)

// The last two are the types staff can create (Staff > Documentation);
// without tabs they could only be found under "All".
const documentTypes = [
  'All',
  'Order Receipt',
  'Inspection Document',
  'Product Report',
  'Staff Documentation',
  'Inspection Note',
]

// ----- Lazy loading: show 15 at a time -----
const PAGE_SIZE = 15
const visibleCount = ref(PAGE_SIZE)
const sentinel = ref(null)
let observer = null

onMounted(() => {
  fetchDocuments()

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMore.value) {
        visibleCount.value += PAGE_SIZE
      }
    },
    // start loading a bit BEFORE the user reaches the very end
    { rootMargin: '400px 0px' }
  )
})

onBeforeUnmount(() => observer?.disconnect())

// Watch the "Loading more..." line. After each batch, look again so a tall screen
// keeps loading until it is filled or everything is shown.
watch(
  [sentinel, visibleCount],
  async () => {
    await nextTick()
    if (!observer) return
    observer.disconnect()
    if (sentinel.value) observer.observe(sentinel.value)
  },
  { flush: 'post' }
)

// Changing the tab starts again from the first 15.
watch(selectedType, () => {
  visibleCount.value = PAGE_SIZE
})

async function fetchDocuments() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_documentations')

  if (error) {
    errorMessage.value = error.message
    documents.value = []
  } else {
    documents.value = data || []
    visibleCount.value = PAGE_SIZE
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

const visibleDocuments = computed(() =>
  filteredDocuments.value.slice(0, visibleCount.value)
)

const hasMore = computed(() => visibleCount.value < filteredDocuments.value.length)

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

  if (type === 'Staff Documentation' || type === 'Inspection Note') {
    return 'bg-amber-500/20 text-amber-300'
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