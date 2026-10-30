<template>
  <div>
    <PageHeader
      title="Documentation"
      subtitle="View receipts, inspection reports, product reports and staff documentation."
    />

    <!-- type tabs (a new page scrolls back up to here) -->
    <div
      ref="tabsRow"
      class="-mx-1 mb-5 flex scroll-mt-4 gap-2 overflow-x-auto px-1 pb-1 sm:mb-6 sm:flex-wrap sm:gap-3 sm:overflow-visible"
    >
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

    <!-- every card is the same size: fixed picture, title of 2 lines and
         description of 3 lines at most, button at the bottom.
         Columns follow the width of the page area (not the whole window, which
         also holds the sidebar): 1, 2, 3, then 4 per row on wide screens. -->
    <div class="@container">
      <div class="grid gap-3 sm:gap-5 @min-[600px]:grid-cols-2 @min-[880px]:grid-cols-3 @min-[1100px]:grid-cols-4">
        <div
          v-for="document in visibleDocuments"
          :key="document.id"
          class="flex flex-col rounded-2xl border border-white/10 bg-zinc-900 p-3 shadow-xl sm:rounded-[24px] sm:p-5"
        >
          <div
            class="mb-3 flex h-32 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black sm:mb-4 sm:h-40 sm:rounded-2xl"
          >
            <img
              v-if="documentImage(document)"
              :src="documentImage(document)"
              loading="lazy"
              class="h-full w-full object-cover"
            />

            <span v-else class="text-sm text-zinc-500">
              No Image
            </span>
          </div>

          <div class="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
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

          <h2 class="line-clamp-2 min-h-[2.75em] text-base font-bold leading-snug text-white sm:text-xl @min-[1100px]:text-lg">
            {{ document.title || document.type || 'Untitled Document' }}
          </h2>

          <p class="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-zinc-400">
            {{ document.description || 'No description provided.' }}
          </p>

          <div class="mt-auto pt-3 sm:pt-5">
            <button
              class="w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 sm:rounded-2xl sm:py-3 sm:text-base"
              @click="openDocument(document)"
            >
              View Details
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 16 or 24 documents a page (4 full rows), or all of them -->
    <TablePager
      v-if="filteredDocuments.length > 0"
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="filteredDocuments.length"
      :sizes="GRID_PAGE_SIZES"
      label="Per page"
      noun="documents"
      card
      class="mt-5"
    />

    <!-- VIEW MODAL: the same size for every document and never taller than
         the screen, so the window itself doesn't scroll. The picture takes
         the space that's left (always whole, never cut off); only a very
         long description scrolls, inside its own box. -->
    <div
      v-if="selectedDocument"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4"
      @click.self="closeDocument"
    >
      <div
        class="flex h-[min(760px,92vh)] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:gap-4 sm:rounded-[24px] sm:p-5"
        role="dialog"
        aria-modal="true"
        :aria-label="selectedDocument.title || 'Document details'"
      >
        <div class="flex shrink-0 items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="line-clamp-2 text-lg font-bold text-white sm:text-2xl">
              {{ selectedDocument.title || selectedDocument.type || 'Document Details' }}
            </h2>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                class="rounded-full px-3 py-1 text-xs font-bold"
                :class="badgeClass(selectedDocument.type)"
              >
                {{ selectedDocument.type || 'Document' }}
              </span>

              <span v-if="selectedDocument.created_at" class="text-sm text-zinc-400">
                {{ formatDate(selectedDocument.created_at) }}
              </span>
            </div>
          </div>

          <button
            class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="closeDocument"
          >
            ✕
          </button>
        </div>

        <!-- tap the picture to open it full size (e.g. to read a receipt) -->
        <a
          v-if="documentImage(selectedDocument)"
          :href="documentImage(selectedDocument)"
          target="_blank"
          rel="noopener"
          title="Open the full picture"
          class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black"
        >
          <img
            :src="documentImage(selectedDocument)"
            :alt="selectedDocument.title || 'Document picture'"
            class="h-full w-full object-contain"
          />
        </a>

        <div
          v-else
          class="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-black text-sm text-zinc-500"
        >
          No Image
        </div>

        <div class="h-[30%] shrink-0 overflow-y-auto rounded-2xl bg-black p-4">
          <p class="mb-2 text-sm font-bold text-zinc-300">
            Description
          </p>

          <p class="whitespace-pre-line text-sm leading-5 text-zinc-400">
            {{ selectedDocument.description || 'No description provided.' }}
          </p>
        </div>

        <button
          class="w-full shrink-0 rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
          @click="closeDocument"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import { GRID_PAGE_SIZES, usePagination } from '../../lib/usePagination'
import PageHeader from '../../components/PageHeader.vue'
import TablePager from '../../components/TablePager.vue'

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

onMounted(fetchDocuments)

async function fetchDocuments() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_documentations')

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

// 16 or 24 documents a page (4 full rows of 4), or all of them. The choice
// is remembered on this device.
const tabsRow = ref(null)
const {
  page,
  pageSize,
  visible: visibleDocuments,
  reset: resetPage,
} = usePagination(filteredDocuments, {
  storageKey: 'documentation',
  scrollTarget: tabsRow,
  sizes: GRID_PAGE_SIZES,
})

// another tab starts again at page 1
watch(selectedType, resetPage)

function openDocument(document) {
  selectedDocument.value = document
}

// a document's picture: receipt_image_url, or image_url when that's empty
function documentImage(document) {
  return document?.receipt_image_url || document?.image_url || ''
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