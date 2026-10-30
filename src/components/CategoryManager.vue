<script setup>
// Inventory > Categories: everything about categories in one window.
//
//   left   the categories (search, "+ New category") and, at the top,
//          Uncategorized: the products that still need one
//   right  the chosen one: its products (move one, or tick several and
//          move them together, with Undo), "Add products", Rename, Delete,
//          and optional notes for the receipt scanner's AI
//
// The window keeps one size whatever is typed. Phones: one side at a time
// (the list; a category opens over it with "‹ All categories").
//
//   <CategoryManager v-if="open" :categories="list" :products="products"
//                    @changed="reload" @close="open = false" />
//
// Changes show at once; "changed" asks the page to load the lists again.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { count } from '../lib/format'
import { NO_CATEGORY } from '../lib/categories'
import NavIcon from './NavIcon.vue'
import TermSuggest from './TermSuggest.vue'

const props = defineProps({
  // [{ id, name, description, product_count }] (lib/categories.js)
  categories: { type: Array, required: true },
  // the inventory's products [{ id, name, category, image_url }]
  products: { type: Array, default: () => [] },
})

const emit = defineEmits(['changed', 'close'])

// what "selected" holds for Uncategorized (categories hold their id)
const UNCATEGORIZED = 'uncategorized'

function productCount(n) {
  return `${count(n)} product${n === 1 ? '' : 's'}`
}

function cleanName(text) {
  return String(text || '').trim().replace(/\s+/g, ' ')
}

function byName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
}

/* ------------------------------------------------------------------
   Changes made here show at once, before the page has loaded the lists
   again. Each is dropped once the page's lists say the same.
------------------------------------------------------------------ */
const movedTo = reactive(new Map()) // product id -> category name
const renamed = reactive(new Map()) // category id -> new name
const notesSaved = reactive(new Map()) // category id -> notes
const deletedIds = reactive(new Set())
const justCreated = ref(null) // the new category, until the list has it

watch(
  () => props.products,
  (list) => {
    for (const product of list) {
      if (movedTo.get(product.id) === (product.category || NO_CATEGORY)) movedTo.delete(product.id)
    }
  }
)

watch(
  () => props.categories,
  (list) => {
    const ids = new Set(list.map((c) => c.id))
    for (const category of list) {
      if (renamed.get(category.id) === category.name) renamed.delete(category.id)
      if (notesSaved.get(category.id) === (category.description || '')) notesSaved.delete(category.id)
    }
    for (const id of deletedIds) if (!ids.has(id)) deletedIds.delete(id)
    if (justCreated.value && ids.has(justCreated.value.id)) justCreated.value = null

    // the open category is gone (deleted elsewhere): open another
    if (selectedKey.value !== UNCATEGORIZED && selectedKey.value !== null && !selected.value) pickDefault()
  }
)

function categoryOf(product) {
  return movedTo.has(product.id) ? movedTo.get(product.id) : product.category || NO_CATEGORY
}

function nameOf(category) {
  return renamed.get(category.id) ?? category.name
}

function notesOf(category) {
  return notesSaved.has(category.id) ? notesSaved.get(category.id) : category.description || ''
}

/* ------------------------------------------------------------------
   The list (left)
------------------------------------------------------------------ */
const allCategories = computed(() => {
  const list = props.categories.filter((c) => !deletedIds.has(c.id))
  if (justCreated.value && !list.some((c) => c.id === justCreated.value.id)) list.push(justCreated.value)
  return list.map((c) => ({ ...c, name: nameOf(c) })).sort(byName)
})

const productsIn = computed(() => {
  const groups = new Map()
  for (const product of props.products) {
    const name = categoryOf(product)
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(product)
  }
  for (const list of groups.values()) list.sort(byName)
  return groups
})

function countIn(name) {
  return productsIn.value.get(name)?.length || 0
}

const uncategorizedCount = computed(() => countIn(NO_CATEGORY))

const search = ref('')
const searchBox = ref(null)
const query = computed(() => cleanName(search.value).toLowerCase())

const listed = computed(() =>
  allCategories.value.filter((c) => !query.value || c.name.toLowerCase().includes(query.value))
)

const showUncategorized = computed(() => !query.value || 'uncategorized'.includes(query.value))

function findByName(name) {
  const lower = cleanName(name).toLowerCase()
  return allCategories.value.find((c) => c.name.toLowerCase() === lower) || null
}

// Enter in the search: open the match, or start making it
function onSearchEnter() {
  if (!query.value) return
  const exact = findByName(search.value)
  if (exact) select(exact.id)
  else if (listed.value.length === 1) select(listed.value[0].id)
  else startCreate(cleanName(search.value))
}

/* ------------------------------------------------------------------
   The open category (right)
------------------------------------------------------------------ */
const selectedKey = ref(null) // a category id, UNCATEGORIZED, or null (none yet)
const detailOnPhone = ref(false) // phones: the category is shown instead of the list

const isUncategorized = computed(() => selectedKey.value === UNCATEGORIZED)
const selected = computed(() => allCategories.value.find((c) => c.id === selectedKey.value) || null)
const selectedName = computed(() => (isUncategorized.value ? NO_CATEGORY : selected.value?.name || ''))
const productsHere = computed(() => productsIn.value.get(selectedName.value) || [])

// first: what still needs a category, else the first category
function pickDefault() {
  if (uncategorizedCount.value > 0) selectedKey.value = UNCATEGORIZED
  else selectedKey.value = allCategories.value[0]?.id ?? null
}

function select(key) {
  selectedKey.value = key
  detailOnPhone.value = true
  closeEditors()
  checked.clear()
  productFilter.value = ''
}

function closeEditors() {
  renaming.value = false
  editingNotes.value = false
  confirmingDelete.value = false
}

// where a product can be moved from here: the other categories, and out
const moveTargets = computed(() => [
  ...allCategories.value.map((c) => c.name).filter((name) => name !== selectedName.value),
  ...(isUncategorized.value ? [] : [NO_CATEGORY]),
])

function targetLabel(name) {
  return name === NO_CATEGORY ? 'Uncategorized (take out)' : name
}

// long lists: a filter
const productFilter = ref('')
const productsShown = computed(() => {
  const q = productFilter.value.trim().toLowerCase()
  return q ? productsHere.value.filter((p) => String(p.name).toLowerCase().includes(q)) : productsHere.value
})

// ticked products, to move together
const checked = reactive(new Set())
const allChecked = computed(
  () => productsShown.value.length > 0 && productsShown.value.every((p) => checked.has(p.id))
)

function toggleChecked(id) {
  if (checked.has(id)) checked.delete(id)
  else checked.add(id)
}

function toggleAll() {
  const all = allChecked.value
  for (const p of productsShown.value) {
    if (all) checked.delete(p.id)
    else checked.add(p.id)
  }
}

/* ------------------------------------------------------------------
   Saving
------------------------------------------------------------------ */
const saving = ref(false) // a category is being made, renamed, deleted…
const pending = reactive(new Set()) // products being moved
const error = ref('')

async function call(rpc, params) {
  saving.value = true
  error.value = ''
  const result = await supabase.rpc(rpc, params)
  saving.value = false
  if (result.error) error.value = result.error.message
  return result
}

// After a change: a message at the bottom for a few seconds, with Undo
// when it can be undone.
const toast = ref(null) // { text, undo }
let toastTimer = null

function showToast(text, undo = null) {
  toast.value = { text, undo }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 6000)
}

function runUndo() {
  const undo = toast.value?.undo
  toast.value = null
  undo?.()
}

/**
 * Moves products: [{ product, to }] (to = a category's name, or NO_CATEGORY).
 * Shown at once; one that can't be saved goes back.
 * message(done) writes the toast; the toast gets Undo unless noUndo.
 */
async function moveProducts(moves, message, noUndo = false) {
  // the product as the page has it now (an Undo can hold an older copy)
  const current = (product) => props.products.find((p) => p.id === product.id) || product

  const work = moves
    .map(({ product, to }) => ({ product: current(product), to }))
    .filter(({ product, to }) => categoryOf(product) !== to && !pending.has(product.id))
  if (work.length === 0) return

  const before = new Map(work.map(({ product }) => [product.id, categoryOf(product)]))
  for (const { product, to } of work) {
    movedTo.set(product.id, to)
    pending.add(product.id)
  }
  error.value = ''

  const results = await Promise.all(
    work.map(({ product, to }) =>
      supabase.rpc('admin_set_product_category', {
        p_product_id: Number(product.id),
        p_category: to === NO_CATEGORY ? '' : to,
      })
    )
  )

  const done = []
  results.forEach((result, i) => {
    const { product, to } = work[i]
    pending.delete(product.id)

    if (result.error) {
      movedTo.set(product.id, before.get(product.id))
      error.value = `Couldn't move "${product.name}": ${result.error.message}`
    } else {
      movedTo.set(product.id, result.data || to)
      done.push(product)
    }
  })

  if (done.length === 0) return

  emit('changed')
  showToast(
    message(done),
    noUndo
      ? null
      : () =>
          moveProducts(
            done.map((product) => ({ product, to: before.get(product.id) })),
            (back) => `Moved ${back.length === 1 ? `"${back[0].name}"` : productCount(back.length)} back.`,
            true
          )
  )
}

function moved(list, to) {
  const what = list.length === 1 ? `"${list[0].name}"` : productCount(list.length)
  return to === NO_CATEGORY ? `Took ${what} out: now Uncategorized.` : `Moved ${what} to ${to}.`
}

// a product's own "Move to…" menu
function moveOne(product, event) {
  const to = event.target.value
  event.target.value = ''
  if (to) moveProducts([{ product, to }], (done) => moved(done, to))
}

// the ticked ones
function moveChecked(event) {
  const to = event.target.value
  event.target.value = ''
  if (!to) return
  const list = productsHere.value.filter((p) => checked.has(p.id))
  checked.clear()
  moveProducts(list.map((product) => ({ product, to })), (done) => moved(done, to))
}

/* ---- Add products ---- */
const addText = ref('')
const addBox = ref(null)

const addOptions = computed(() =>
  props.products
    .filter((product) => categoryOf(product) !== selectedName.value)
    .map((product) => ({
      id: product.id,
      text: product.name,
      hint: categoryOf(product) === NO_CATEGORY ? 'Uncategorized' : `in ${categoryOf(product)}`,
    }))
)

function addPicked(item) {
  addText.value = ''
  const product = props.products.find((p) => p.id === item.id)
  const to = selectedName.value
  if (product) moveProducts([{ product, to }], (done) => `Added "${done[0].name}" to ${to}.`)
}

/* ---- New category ---- */
const creating = ref(false)
const newName = ref('')
const newNameBox = ref(null)
const newNameTaken = computed(() => (creating.value && newName.value.trim() ? findByName(newName.value) : null))

function startCreate(prefill = '') {
  creating.value = true
  newName.value = prefill
  nextTick(() => newNameBox.value?.focus())
}

function cancelCreate() {
  creating.value = false
  newName.value = ''
}

async function create() {
  const name = cleanName(newName.value)
  if (!name || saving.value) return

  // already there: just open it
  const existing = findByName(name)
  if (existing) {
    cancelCreate()
    search.value = ''
    select(existing.id)
    showToast(`"${existing.name}" is already a category, so it's opened.`)
    return
  }

  const { data, error: saveError } = await call('admin_save_category', {
    p_id: null,
    p_name: name,
    p_description: '',
  })
  if (saveError) return

  justCreated.value = data
  cancelCreate()
  search.value = ''
  select(data.id)
  emit('changed')
  showToast(`Made "${data.name}". Add its products above.`)
  nextTick(() => addBox.value?.focus())
}

/* ---- Rename ---- */
const renaming = ref(false)
const renameText = ref('')
const renameBox = ref(null)

function startRename() {
  closeEditors()
  renaming.value = true
  renameText.value = selected.value.name
  nextTick(() => renameBox.value?.select())
}

async function saveRename() {
  const category = selected.value
  const name = cleanName(renameText.value)

  if (!name || name === category.name) {
    renaming.value = false
    return
  }

  const other = findByName(name)
  if (other && other.id !== category.id) {
    error.value = `There is already a category called "${other.name}".`
    return
  }

  const { data, error: saveError } = await call('admin_save_category', {
    p_id: category.id,
    p_name: name,
    p_description: notesOf(category),
  })
  if (saveError) return

  // its products go along (the database moved them too)
  for (const product of productsHere.value) movedTo.set(product.id, data.name)
  renamed.set(category.id, data.name)
  renaming.value = false
  emit('changed')
  showToast(`Renamed to "${data.name}".`)
}

/* ---- Delete ---- */
const confirmingDelete = ref(false)

async function removeCategory() {
  const category = selected.value
  const { data: movedOut, error: deleteError } = await call('admin_delete_category', { p_id: category.id })
  if (deleteError) return

  for (const product of productsHere.value) movedTo.set(product.id, NO_CATEGORY)
  deletedIds.add(category.id)
  confirmingDelete.value = false
  pickDefault()
  emit('changed')
  showToast(
    movedOut > 0
      ? `Deleted "${category.name}". Its ${productCount(movedOut)} ${movedOut === 1 ? 'is' : 'are'} now Uncategorized.`
      : `Deleted "${category.name}".`
  )
}

/* ---- Notes for the receipt scanner's AI ---- */
const editingNotes = ref(false)
const notesText = ref('')

function startNotes() {
  closeEditors()
  editingNotes.value = true
  notesText.value = notesOf(selected.value)
}

async function saveNotes() {
  const category = selected.value
  const notes = notesText.value.trim()

  const { error: saveError } = await call('admin_save_category', {
    p_id: category.id,
    p_name: category.name,
    p_description: notes,
  })
  if (saveError) return

  notesSaved.set(category.id, notes)
  editingNotes.value = false
  emit('changed')
  showToast(notes ? 'Notes saved.' : 'Notes removed.')
}

/* ------------------------------------------------------------------
   Keys, opening, closing
------------------------------------------------------------------ */
// Esc: close what's open inside first, then the window
function onKey(event) {
  if (event.key !== 'Escape' || saving.value) return

  if (renaming.value) renaming.value = false
  else if (editingNotes.value) editingNotes.value = false
  else if (confirmingDelete.value) confirmingDelete.value = false
  else if (creating.value) cancelCreate()
  else if (checked.size > 0) checked.clear()
  else emit('close')
}

function close() {
  if (!saving.value) emit('close')
}

onMounted(() => {
  pickDefault()
  window.addEventListener('keydown', onKey)
  // a mouse: start in the search (on phones the keyboard would pop up)
  if (window.matchMedia?.('(pointer: fine)').matches) nextTick(() => searchBox.value?.focus())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 sm:p-4"
    @click.self="close"
  >
    <div
      class="relative flex h-full w-full flex-col overflow-hidden bg-zinc-900 shadow-2xl sm:h-[min(720px,90vh)] sm:max-w-5xl sm:rounded-[24px] sm:border sm:border-white/10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="categories-title"
    >
      <!-- TITLE -->
      <header class="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div class="min-w-0">
          <h2 id="categories-title" class="text-xl font-extrabold text-white">Categories</h2>
          <p class="mt-0.5 text-sm text-zinc-400">
            Group your products. New products from supplier receipts are sorted into these too.
          </p>
        </div>

        <button
          type="button"
          class="shrink-0 rounded-full bg-zinc-800 px-3 py-1.5 font-bold text-white hover:bg-zinc-700"
          aria-label="Close"
          @click="close"
        >
          ✕
        </button>
      </header>

      <div class="flex min-h-0 flex-1">
        <!-- ============================================================
             LEFT: the categories
        ============================================================ -->
        <aside
          class="flex w-full min-w-0 flex-col border-white/5 sm:w-72 sm:shrink-0 sm:border-r"
          :class="detailOnPhone ? 'max-sm:hidden' : ''"
        >
          <div class="p-3">
            <input
              ref="searchBox"
              v-model="search"
              type="search"
              placeholder="Search categories"
              aria-label="Search categories"
              class="input"
              @keydown.enter.prevent="onSearchEnter"
            />
          </div>

          <nav class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2" aria-label="Categories">
            <!-- what still needs a category -->
            <template v-if="showUncategorized">
              <button
                type="button"
                class="cat-item"
                :class="{ 'is-active': isUncategorized }"
                :aria-current="isUncategorized ? 'true' : undefined"
                @click="select(UNCATEGORIZED)"
              >
                <span class="truncate italic">Uncategorized</span>
                <span class="count" :class="{ 'is-alert': uncategorizedCount > 0 }">
                  {{ count(uncategorizedCount) }}
                </span>
              </button>
              <div class="mx-2 my-2 border-t border-white/5" aria-hidden="true"></div>
            </template>

            <button
              v-for="category in listed"
              :key="category.id"
              type="button"
              class="cat-item"
              :class="{ 'is-active': selectedKey === category.id }"
              :aria-current="selectedKey === category.id ? 'true' : undefined"
              @click="select(category.id)"
            >
              <span class="truncate">{{ category.name }}</span>
              <span class="count">{{ count(countIn(category.name)) }}</span>
            </button>

            <!-- searching: none with that name -->
            <div v-if="query && !findByName(search)" class="px-3 py-3 text-sm text-zinc-400">
              <p v-if="listed.length === 0">No category matches "{{ search.trim() }}".</p>
              <button
                type="button"
                class="mt-2 font-bold text-red-300 hover:text-white"
                @click="startCreate(search.trim())"
              >
                + Make "{{ search.trim() }}"
              </button>
            </div>

            <p v-if="allCategories.length === 0 && !query" class="px-3 py-3 text-sm text-zinc-500">
              No categories yet.
            </p>
          </nav>

          <!-- NEW CATEGORY -->
          <div class="border-t border-white/5 p-3">
            <form v-if="creating" class="space-y-2" @submit.prevent="create">
              <input
                ref="newNameBox"
                v-model="newName"
                maxlength="60"
                placeholder="Name, e.g. Plumbing"
                aria-label="Name of the new category"
                class="input"
              />
              <p v-if="newNameTaken" class="text-xs text-yellow-300">
                "{{ newNameTaken.name }}" is already a category. Add opens it.
              </p>
              <div class="flex gap-2">
                <button
                  type="submit"
                  class="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  :disabled="saving || !newName.trim()"
                >
                  {{ saving ? 'Adding…' : 'Add' }}
                </button>
                <button
                  type="button"
                  class="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                  @click="cancelCreate"
                >
                  Cancel
                </button>
              </div>
            </form>

            <button
              v-else
              type="button"
              class="w-full rounded-xl border border-dashed border-white/15 py-2.5 text-sm font-bold text-zinc-300 hover:border-red-500/50 hover:text-white"
              @click="startCreate()"
            >
              + New category
            </button>
          </div>
        </aside>

        <!-- ============================================================
             RIGHT: the open category
        ============================================================ -->
        <section
          class="relative flex min-w-0 flex-1 flex-col"
          :class="detailOnPhone ? '' : 'max-sm:hidden'"
        >
          <!-- after a change: what happened, and Undo (over this side only) -->
          <div
            v-if="toast"
            class="absolute bottom-4 left-1/2 z-30 flex w-[min(92%,30rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-2xl"
            role="status"
          >
            <span class="min-w-0">{{ toast.text }}</span>
            <button
              v-if="toast.undo"
              type="button"
              class="shrink-0 font-bold text-red-300 hover:text-white"
              @click="runUndo"
            >
              Undo
            </button>
          </div>

          <!-- phones: back to the list -->
          <button
            type="button"
            class="flex items-center gap-1 border-b border-white/5 px-5 py-3 text-sm font-bold text-zinc-300 sm:hidden"
            @click="detailOnPhone = false"
          >
            <NavIcon name="back" class="h-4 w-4" />
            All categories
          </button>

          <template v-if="isUncategorized || selected">
            <!-- ITS NAME, Rename, Delete -->
            <div class="border-b border-white/5 px-5 py-4">
              <form v-if="renaming" class="flex flex-wrap items-center gap-2" @submit.prevent="saveRename">
                <input
                  ref="renameBox"
                  v-model="renameText"
                  maxlength="60"
                  aria-label="New name"
                  class="input min-w-0 flex-1"
                />
                <button
                  type="submit"
                  class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  :disabled="saving"
                >
                  {{ saving ? 'Saving…' : 'Save' }}
                </button>
                <button
                  type="button"
                  class="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                  @click="renaming = false"
                >
                  Cancel
                </button>
                <p v-if="productsHere.length > 0" class="basis-full text-xs text-zinc-500">
                  Its {{ productCount(productsHere.length) }} stay in it under the new name.
                </p>
              </form>

              <div v-else class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="truncate text-lg font-extrabold text-white" :class="{ italic: isUncategorized }">
                    {{ selectedName }}
                  </h3>
                  <p class="text-sm text-zinc-400">
                    <template v-if="isUncategorized">
                      {{
                        productsHere.length > 0
                          ? `${productCount(productsHere.length)} still need${productsHere.length === 1 ? 's' : ''} a category`
                          : 'Every product has a category.'
                      }}
                    </template>
                    <template v-else>{{ productCount(productsHere.length) }}</template>
                  </p>
                </div>

                <div v-if="!isUncategorized" class="flex gap-2">
                  <button
                    type="button"
                    class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                    @click="startRename"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-red-600/15 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30 hover:text-white"
                    @click="closeEditors(); confirmingDelete = true"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div v-if="confirmingDelete" class="mt-3 rounded-xl bg-red-600/10 p-3">
                <p class="text-sm text-white">
                  Delete <b>{{ selectedName }}</b>?
                  <span class="text-zinc-400">
                    {{
                      productsHere.length > 0
                        ? `Its ${productCount(productsHere.length)} will be Uncategorized.`
                        : 'No products are in it.'
                    }}
                  </span>
                </p>
                <div class="mt-3 flex gap-2">
                  <button
                    type="button"
                    class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    :disabled="saving"
                    @click="removeCategory"
                  >
                    {{ saving ? 'Deleting…' : 'Yes, delete' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                    @click="confirmingDelete = false"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            </div>

            <p v-if="error" class="mx-5 mt-4 flex items-start justify-between gap-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
              {{ error }}
              <button type="button" class="shrink-0 font-bold hover:text-white" aria-label="Dismiss" @click="error = ''">✕</button>
            </p>

            <div class="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-4">
              <!-- ADD PRODUCTS -->
              <div v-if="!isUncategorized">
                <label class="field-label" for="add-products">Add products to {{ selectedName }}</label>
                <TermSuggest
                  id="add-products"
                  ref="addBox"
                  v-model="addText"
                  single
                  auto-highlight
                  :options="addOptions"
                  placeholder="Type a product name, then Enter"
                  empty-text="No product matches."
                  class="input mt-2"
                  @pick="addPicked"
                />
              </div>

              <!-- ITS PRODUCTS -->
              <div>
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label v-if="productsShown.length > 0" class="flex items-center gap-2 text-xs font-bold text-zinc-400">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-red-600"
                      :checked="allChecked"
                      @change="toggleAll"
                    />
                    Select all
                  </label>
                  <span v-else class="field-label">Products</span>

                  <input
                    v-if="productsHere.length > 8"
                    v-model="productFilter"
                    type="search"
                    placeholder="Filter these products"
                    aria-label="Filter these products"
                    class="input filter-input"
                  />
                </div>

                <!-- the ticked ones -->
                <div
                  v-if="checked.size > 0"
                  class="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-red-600/10 px-3 py-2 text-sm"
                >
                  <b class="text-white">{{ count(checked.size) }} selected</b>
                  <select class="move-select" aria-label="Move the selected products" @change="moveChecked">
                    <option value="">{{ isUncategorized ? 'Put them in…' : 'Move them to…' }}</option>
                    <option v-for="name in moveTargets" :key="name" :value="name">{{ targetLabel(name) }}</option>
                  </select>
                  <button type="button" class="font-bold text-zinc-400 hover:text-white" @click="checked.clear()">
                    Clear
                  </button>
                </div>

                <ul class="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5">
                  <li
                    v-for="product in productsShown"
                    :key="product.id"
                    class="flex items-center gap-3 px-3 py-2"
                    :class="checked.has(product.id) ? 'bg-white/[0.04]' : ''"
                  >
                    <input
                      type="checkbox"
                      class="h-4 w-4 shrink-0 accent-red-600"
                      :checked="checked.has(product.id)"
                      :aria-label="`Select ${product.name}`"
                      @change="toggleChecked(product.id)"
                    />
                    <img
                      v-if="product.image_url"
                      :src="product.image_url"
                      alt=""
                      loading="lazy"
                      class="h-8 w-8 shrink-0 rounded-[8px] object-cover"
                    />
                    <span v-else class="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-white/5 text-zinc-500">
                      <NavIcon name="inventory" class="h-4 w-4" />
                    </span>

                    <span class="min-w-0 flex-1 truncate text-sm text-zinc-200">{{ product.name }}</span>

                    <select
                      class="move-select"
                      :disabled="pending.has(product.id)"
                      :aria-label="`Move ${product.name}`"
                      @change="moveOne(product, $event)"
                    >
                      <option value="">{{ isUncategorized ? 'Put in…' : 'Move to…' }}</option>
                      <option v-for="name in moveTargets" :key="name" :value="name">{{ targetLabel(name) }}</option>
                    </select>
                  </li>

                  <li v-if="productsHere.length === 0" class="px-3 py-8 text-center text-sm text-zinc-500">
                    <template v-if="isUncategorized">
                      <NavIcon name="check" class="mx-auto mb-2 h-6 w-6 text-emerald-400" />
                      All products are sorted.
                    </template>
                    <template v-else>No products in {{ selectedName }} yet. Add some above.</template>
                  </li>
                  <li
                    v-else-if="productsShown.length === 0"
                    class="px-3 py-6 text-center text-sm text-zinc-500"
                  >
                    No product here matches "{{ productFilter.trim() }}".
                  </li>
                </ul>
              </div>

              <!-- NOTES FOR THE RECEIPT SCANNER'S AI (optional) -->
              <div v-if="!isUncategorized" class="rounded-xl border border-white/5 bg-black/20 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="field-label">
                      Notes for the receipt scanner
                      <span class="font-normal normal-case tracking-normal">(optional)</span>
                    </p>
                    <p class="mt-1 text-xs text-zinc-500">
                      Its AI reads these when it sorts new products from receipts. Only needed if
                      it puts things in the wrong category, e.g. "nails, screws, bolts".
                    </p>
                  </div>
                  <button
                    v-if="!editingNotes"
                    type="button"
                    class="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                    @click="startNotes"
                  >
                    {{ notesOf(selected) ? 'Edit' : 'Add notes' }}
                  </button>
                </div>

                <p v-if="!editingNotes && notesOf(selected)" class="mt-3 text-sm text-zinc-300">
                  {{ notesOf(selected) }}
                </p>

                <form v-if="editingNotes" class="mt-3 space-y-2" @submit.prevent="saveNotes">
                  <TermSuggest
                    v-model="notesText"
                    multiline
                    :options="addOptions"
                    maxlength="300"
                    rows="3"
                    placeholder="e.g. nails, screws, bolts, rivets"
                    aria-label="Notes for the receipt scanner"
                    class="input resize-none"
                  />
                  <div class="flex gap-2">
                    <button
                      type="submit"
                      class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      :disabled="saving"
                    >
                      {{ saving ? 'Saving…' : 'Save notes' }}
                    </button>
                    <button
                      type="button"
                      class="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                      @click="editingNotes = false"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </template>

          <!-- no categories at all yet -->
          <div v-else class="grid flex-1 place-items-center p-8 text-center">
            <div>
              <span class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-zinc-300">
                <NavIcon name="tag" class="h-6 w-6" />
              </span>
              <p class="mt-3 font-bold text-white">No categories yet</p>
              <p class="mt-1 text-sm text-zinc-400">Make the first one, e.g. Fasteners, Plumbing or Electrical.</p>
              <button
                type="button"
                class="mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
                @click="detailOnPhone = false; startCreate()"
              >
                + New category
              </button>
            </div>
          </div>
        </section>
      </div>

    </div>
  </div>
</template>

<style scoped>
.cat-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-radius: 0.75rem;
  padding: 0.55rem 0.75rem;
  text-align: left;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-zinc-300);
}

.cat-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
}

.cat-item.is-active {
  background: rgba(224, 27, 50, 0.15);
  color: #fff;
  box-shadow: inset 3px 0 0 var(--brand);
}

.count {
  flex: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.05rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-zinc-400);
}

.count.is-alert {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-yellow-400);
}

/* the small filter over a long product list */
.filter-input {
  max-width: 14rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
}

.field-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

.move-select {
  max-width: 11rem;
  flex: none;
  cursor: pointer;
  border-radius: 0.6rem;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
  padding: 0.3rem 0.5rem;
  font-size: 0.8rem;
  color: var(--color-zinc-300);
  outline: none;
}

.move-select:hover,
.move-select:focus-visible {
  border-color: rgba(224, 27, 50, 0.45);
  color: #fff;
}

.move-select:disabled {
  cursor: wait;
  opacity: 0.6;
}

.move-select option {
  background: var(--surface);
  color: #fff;
}
</style>
