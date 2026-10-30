<script setup>
// Inventory > Categories: the owner adds, renames, describes and deletes
// the product categories. The description says what goes in a category;
// the receipt scanner's AI (n8n) reads it to choose one for new products.
//
// While typing a name, the list shows only the categories that match (and
// says so when that name already exists). While typing what goes in one,
// the inventory's products that match are suggested.
//
//   <CategoryManager v-if="open" :categories="list" :products="products"
//                    @changed="reload" @close="open = false" />
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { count } from '../lib/format'
import NavIcon from './NavIcon.vue'
import TermSuggest from './TermSuggest.vue'

const props = defineProps({
  // [{ id, name, description, product_count }] (lib/categories.js)
  categories: { type: Array, required: true },
  // the inventory's products [{ name, category }], suggested while typing
  products: { type: Array, default: () => [] },
})

const emit = defineEmits(['changed', 'close'])

const newName = ref('')
const newDescription = ref('')
const nameInput = ref(null)

const editingId = ref(null)
const editName = ref('')
const editDescription = ref('')
const deletingId = ref(null) // asking "Delete?" for this one

const busy = ref(false)
const error = ref('')
const notice = ref('')

function productCount(n) {
  return `${count(n)} product${n === 1 ? '' : 's'}`
}

/* ---- typing a name: the matches drop down under the box (like the
   products); the list stays whole, so the window keeps its size, with
   the typed letters marked ---- */
const query = computed(() => newName.value.trim().replace(/\s+/g, ' ').toLowerCase())

// each with its name cut around the typed letters, to mark them
const shown = computed(() =>
  props.categories
    .map((category) => {
      const at = query.value ? category.name.toLowerCase().indexOf(query.value) : -1
      return {
        ...category,
        before: at < 0 ? category.name : category.name.slice(0, at),
        match: at < 0 ? '' : category.name.slice(at, at + query.value.length),
        after: at < 0 ? '' : category.name.slice(at + query.value.length),
      }
    })
)

// that exact name is a category already: edit it rather than add it twice
const existing = computed(() =>
  query.value ? props.categories.find((category) => category.name.toLowerCase() === query.value) : null
)

function editExisting() {
  const category = existing.value
  newName.value = ''
  newDescription.value = ''
  startEdit(category)
}

// the name box's dropdown: the categories that match, with their size
const categoryOptions = computed(() =>
  props.categories.map((category) => ({
    text: category.name,
    hint: productCount(category.product_count),
  }))
)

// picked from that dropdown: open it to show its products (scrolled to and
// lit up for a moment). Editing is its own Edit button.
const foundId = ref(null)
let foundTimer = null

function findPicked(item) {
  const category = props.categories.find((c) => c.name === item.text)
  if (!category) return

  newName.value = ''
  openProducts(category, true)
  foundId.value = category.id
  clearTimeout(foundTimer)
  foundTimer = setTimeout(() => (foundId.value = null), 2500)

  nextTick(() =>
    document.getElementById(`category-${category.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  )
}

/* ---- a category's products: shown when it's opened ---- */
const openId = ref(null) // the category whose products are shown
const addProductText = ref('')

function openProducts(category, keepOpen = false) {
  openId.value = openId.value === category.id && !keepOpen ? null : category.id
  addProductText.value = ''
  editingId.value = null
  deletingId.value = null
}

function productsIn(name) {
  return props.products
    .filter((product) => (product.category || 'Uncategorized') === name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

// products to add to a category: the ones not in it yet
function addOptions(name) {
  return props.products
    .filter((product) => (product.category || 'Uncategorized') !== name)
    .map((product) => ({
      id: product.id,
      text: product.name,
      hint: !product.category || product.category === 'Uncategorized' ? 'Uncategorized' : `in ${product.category}`,
    }))
}

// put a product in a category ('' = take it out: Uncategorized)
async function moveProduct(product, categoryName) {
  busy.value = true
  error.value = ''
  notice.value = ''

  const { error: moveError } = await supabase.rpc('admin_set_product_category', {
    p_product_id: Number(product.id),
    p_category: categoryName,
  })

  busy.value = false
  addProductText.value = ''

  if (moveError) {
    error.value = moveError.message
    return
  }

  const name = product.name || product.text
  notice.value = categoryName ? `Put "${name}" in ${categoryName}.` : `Took "${name}" out (now Uncategorized).`
  emit('changed')
}

/* ---- typing what goes in it: the products that match ---- */
const productOptions = computed(() =>
  props.products.map((product) => ({
    text: product.name,
    hint: !product.category || product.category === 'Uncategorized' ? 'Uncategorized' : `in ${product.category}`,
  }))
)

async function save(id, name, description) {
  busy.value = true
  error.value = ''
  notice.value = ''

  const { error: saveError } = await supabase.rpc('admin_save_category', {
    p_id: id,
    p_name: name,
    p_description: description,
  })

  busy.value = false

  if (saveError) {
    // e.g. 'There is already a category called "Screws".'
    error.value = saveError.message
    return false
  }

  emit('changed')
  return true
}

async function add() {
  const name = newName.value.trim()

  if (!name) {
    error.value = 'Enter a name for the category.'
    nameInput.value?.focus()
    return
  }

  if (existing.value) return // the Add button is off; "Edit it" is offered

  if (await save(null, name, newDescription.value)) {
    notice.value = `Added "${name}".`
    newName.value = ''
    newDescription.value = ''
    nameInput.value?.focus()
  }
}

function startEdit(category) {
  editingId.value = category.id
  editName.value = category.name
  editDescription.value = category.description || ''
  deletingId.value = null
  error.value = ''
  notice.value = ''
}

async function saveEdit(category) {
  const name = editName.value.trim()

  if (await save(category.id, name, editDescription.value)) {
    notice.value =
      name !== category.name && category.product_count > 0
        ? `Renamed to "${name}". Its ${productCount(category.product_count)} moved along.`
        : `Saved "${name}".`
    editingId.value = null
  }
}

function askDelete(category) {
  deletingId.value = category.id
  editingId.value = null
  error.value = ''
  notice.value = ''
}

async function remove(category) {
  busy.value = true
  error.value = ''
  notice.value = ''

  const { data: moved, error: deleteError } = await supabase.rpc('admin_delete_category', {
    p_id: category.id,
  })

  busy.value = false

  if (deleteError) {
    error.value = deleteError.message
    return
  }

  deletingId.value = null
  notice.value =
    moved > 0
      ? `Deleted "${category.name}". Its ${productCount(moved)} ${moved === 1 ? 'is' : 'are'} now Uncategorized.`
      : `Deleted "${category.name}".`
  emit('changed')
}

// Esc: stop editing / deleting first, then close
function onKey(event) {
  if (event.key !== 'Escape' || busy.value) return

  if (editingId.value !== null) editingId.value = null
  else if (deletingId.value !== null) deletingId.value = null
  else emit('close')
}

function close() {
  if (!busy.value) emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  nextTick(() => nameInput.value?.focus())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(foundTimer)
})
</script>

<template>
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-4"
    @click.self="close"
  >
    <div
      class="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-[24px] border border-white/10 bg-zinc-900 shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="categories-title"
    >
      <!-- TITLE -->
      <div class="flex items-start justify-between gap-3 border-b border-white/5 p-5">
        <div>
          <h2 id="categories-title" class="text-xl font-extrabold text-white">Categories</h2>
          <p class="mt-1 text-sm text-zinc-400">
            You decide the categories and every product goes in one. The receipt scanner's AI
            uses this same list, and the descriptions, to sort new products.
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
      </div>

      <!-- ADD: the name also finds the categories that match it (list below);
           "what goes in it" suggests the inventory's products as you type -->
      <form class="grid gap-2 border-b border-white/5 p-5 sm:grid-cols-[1fr_1.4fr_auto]" @submit.prevent="add">
        <!-- the categories that match drop down too; picking one opens it to edit -->
        <TermSuggest
          ref="nameInput"
          v-model="newName"
          single
          :options="categoryOptions"
          maxlength="60"
          placeholder="Find or add a category"
          aria-label="Name of the new category"
          class="input"
          :empty-text="existing ? '' : `No category called &quot;${newName.trim()}&quot; yet. Press Add to make it.`"
          @pick="findPicked"
        />
        <TermSuggest
          v-model="newDescription"
          :options="productOptions"
          maxlength="300"
          placeholder="What goes in it, e.g. pipes, fittings, faucets"
          aria-label="What goes in the new category"
          class="input"
        />
        <button
          type="submit"
          class="rounded-xl bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700 disabled:opacity-50"
          :disabled="busy || !!existing"
        >
          Add
        </button>

        <p v-if="existing" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-yellow-300 sm:col-span-3" role="status">
          <NavIcon name="alert" class="h-4 w-4 shrink-0" />
          "{{ existing.name }}" is already a category ({{ productCount(existing.product_count) }}).
          <button type="button" class="font-bold underline hover:text-white" @click="findPicked({ text: existing.name })">
            Show it
          </button>
          <button type="button" class="font-bold underline hover:text-white" @click="editExisting">
            Edit it
          </button>
        </p>
      </form>

      <p v-if="error" class="mx-5 mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
        {{ error }}
      </p>
      <p v-if="notice" class="mx-5 mt-4 rounded-xl bg-emerald-600/15 p-3 text-sm text-emerald-400" role="status">
        {{ notice }}
      </p>

      <!-- THE LIST -->
      <ul class="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
        <li
          v-for="category in shown"
          :id="`category-${category.id}`"
          :key="category.id"
          class="p-4 transition-colors duration-500 sm:px-5"
          :class="foundId === category.id ? 'bg-red-500/15' : ''"
        >
          <!-- editing -->
          <form v-if="editingId === category.id" class="grid gap-2" @submit.prevent="saveEdit(category)">
            <input
              v-model="editName"
              maxlength="60"
              aria-label="Category name"
              class="input"
            />
            <TermSuggest
              v-model="editDescription"
              multiline
              :options="productOptions"
              maxlength="300"
              rows="2"
              placeholder="What goes in it"
              aria-label="What goes in it"
              class="input resize-none"
            />
            <p v-if="editName.trim() !== category.name && category.product_count > 0" class="text-xs text-zinc-400">
              Its {{ productCount(category.product_count) }} move to the new name.
            </p>
            <div class="flex gap-2">
              <button
                type="submit"
                class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                :disabled="busy"
              >
                {{ busy ? 'Saving…' : 'Save' }}
              </button>
              <button
                type="button"
                class="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                @click="editingId = null"
              >
                Cancel
              </button>
            </div>
          </form>

          <!-- "Delete?" -->
          <div v-else-if="deletingId === category.id" class="rounded-xl bg-red-600/10 p-3">
            <p class="text-sm text-white">
              Delete <b>{{ category.name }}</b>?
              <span class="text-zinc-400">
                {{
                  category.product_count > 0
                    ? `Its ${productCount(category.product_count)} will be Uncategorized.`
                    : 'No products are in it.'
                }}
              </span>
            </p>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                :disabled="busy"
                @click="remove(category)"
              >
                {{ busy ? 'Deleting…' : 'Yes, delete' }}
              </button>
              <button
                type="button"
                class="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                @click="deletingId = null"
              >
                Keep it
              </button>
            </div>
          </div>

          <!-- the category: click it to show its products -->
          <template v-else>
          <div class="flex items-start gap-3">
            <span class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/5 text-zinc-300">
              <NavIcon name="tag" class="h-4 w-4" />
            </span>

            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              :aria-expanded="openId === category.id"
              :title="openId === category.id ? 'Hide its products' : 'Show its products'"
              @click="openProducts(category)"
            >
              <p class="font-bold text-white">
                <!-- the typed letters marked -->
                {{ category.before }}<mark
                  v-if="category.match"
                  class="rounded bg-red-500/30 px-0.5 text-white"
                >{{ category.match }}</mark>{{ category.after }}
                <span class="ml-1 text-xs font-normal text-zinc-500">
                  {{ productCount(category.product_count) }}
                  <span aria-hidden="true">{{ openId === category.id ? '▴' : '▾' }}</span>
                </span>
              </p>
              <p class="mt-0.5 text-sm" :class="category.description ? 'text-zinc-400' : 'italic text-zinc-500'">
                {{ category.description || 'No description yet. Add one so the AI knows what goes here.' }}
              </p>
            </button>

            <div class="flex shrink-0 gap-1">
              <button
                type="button"
                class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                @click="startEdit(category)"
              >
                Edit
              </button>
              <button
                type="button"
                class="rounded-lg bg-red-600/15 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30 hover:text-white"
                @click="askDelete(category)"
              >
                Delete
              </button>
            </div>
          </div>

          <!-- ITS PRODUCTS: take one out, or add one -->
          <div v-if="openId === category.id" class="ml-12 mt-3 rounded-xl border border-white/5 bg-black/20 p-3">
            <p class="mb-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Products in {{ category.name }}
            </p>

            <ul class="space-y-1">
              <li
                v-for="product in productsIn(category.name)"
                :key="product.id"
                class="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
              >
                <span class="min-w-0 truncate text-zinc-200">{{ product.name }}</span>
                <button
                  type="button"
                  class="shrink-0 text-xs font-bold text-zinc-400 hover:text-red-300 disabled:opacity-50"
                  :disabled="busy"
                  title="Take it out of this category (it becomes Uncategorized)"
                  @click="moveProduct(product, '')"
                >
                  Remove
                </button>
              </li>
              <li v-if="productsIn(category.name).length === 0" class="px-2 py-1.5 text-sm text-zinc-500">
                No products in it yet.
              </li>
            </ul>

            <TermSuggest
              v-model="addProductText"
              single
              :options="addOptions(category.name)"
              placeholder="Add a product to this category…"
              aria-label="Add a product to this category"
              empty-text="No product matches."
              class="input mt-3"
              @pick="(item) => moveProduct(item, category.name)"
            />
          </div>
          </template>
        </li>

        <li v-if="categories.length === 0" class="p-6 text-center text-sm text-zinc-500">
          No categories yet. Add the first one above.
        </li>
      </ul>
    </div>
  </div>
</template>
