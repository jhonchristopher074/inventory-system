<script setup>
// Inventory > Categories: the owner adds, renames, describes and deletes
// the product categories. The description says what goes in a category;
// the receipt scanner's AI (n8n) reads it to choose one for new products.
//
//   <CategoryManager v-if="open" :categories="list" @changed="reload" @close="open = false" />
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { count } from '../lib/format'
import NavIcon from './NavIcon.vue'

defineProps({
  // [{ id, name, description, product_count }] (lib/categories.js)
  categories: { type: Array, required: true },
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

function products(n) {
  return `${count(n)} product${n === 1 ? '' : 's'}`
}

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
        ? `Renamed to "${name}". Its ${products(category.product_count)} moved along.`
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
      ? `Deleted "${category.name}". Its ${products(moved)} ${moved === 1 ? 'is' : 'are'} now Uncategorized.`
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

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-4"
    @click.self="close"
  >
    <div
      class="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900 shadow-2xl"
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

      <!-- ADD -->
      <form class="grid gap-2 border-b border-white/5 p-5 sm:grid-cols-[1fr_1.4fr_auto]" @submit.prevent="add">
        <input
          ref="nameInput"
          v-model="newName"
          maxlength="60"
          placeholder="New category, e.g. Plumbing"
          aria-label="Name of the new category"
          class="input"
        />
        <input
          v-model="newDescription"
          maxlength="300"
          placeholder="What goes in it, e.g. pipes, fittings, faucets"
          aria-label="What goes in the new category"
          class="input"
        />
        <button
          type="submit"
          class="rounded-xl bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700 disabled:opacity-50"
          :disabled="busy"
        >
          Add
        </button>
      </form>

      <p v-if="error" class="mx-5 mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
        {{ error }}
      </p>
      <p v-if="notice" class="mx-5 mt-4 rounded-xl bg-emerald-600/15 p-3 text-sm text-emerald-400" role="status">
        {{ notice }}
      </p>

      <!-- THE LIST -->
      <ul class="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto">
        <li v-for="category in categories" :key="category.id" class="p-4 sm:px-5">
          <!-- editing -->
          <form v-if="editingId === category.id" class="grid gap-2" @submit.prevent="saveEdit(category)">
            <input
              v-model="editName"
              maxlength="60"
              aria-label="Category name"
              class="input"
            />
            <textarea
              v-model="editDescription"
              maxlength="300"
              rows="2"
              placeholder="What goes in it"
              aria-label="What goes in it"
              class="input resize-none"
            ></textarea>
            <p v-if="editName.trim() !== category.name && category.product_count > 0" class="text-xs text-zinc-400">
              Its {{ products(category.product_count) }} move to the new name.
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
                    ? `Its ${products(category.product_count)} will be Uncategorized.`
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

          <!-- the category -->
          <div v-else class="flex items-start gap-3">
            <span class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/5 text-zinc-300">
              <NavIcon name="tag" class="h-4 w-4" />
            </span>

            <div class="min-w-0 flex-1">
              <p class="font-bold text-white">
                {{ category.name }}
                <span class="ml-1 text-xs font-normal text-zinc-500">{{ products(category.product_count) }}</span>
              </p>
              <p class="mt-0.5 text-sm" :class="category.description ? 'text-zinc-400' : 'italic text-zinc-500'">
                {{ category.description || 'No description yet. Add one so the AI knows what goes here.' }}
              </p>
            </div>

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
        </li>

        <li v-if="categories.length === 0" class="p-6 text-center text-sm text-zinc-500">
          No categories yet. Add the first one above.
        </li>
      </ul>
    </div>
  </div>
</template>
