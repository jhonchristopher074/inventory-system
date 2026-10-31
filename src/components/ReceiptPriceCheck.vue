<script setup>
// "Check prices" window of the Approval page: the products one receipt added
// or restocked, each with its category and its new price.
//   - Category: saved the moment it's picked (like Inventory's Category menu).
//   - Price: saved for all of them with "Confirm prices".
// A table on computers; each product becomes a card on phones.
//
//   <ReceiptPriceCheck :group="group" :prices="priceEdits" :saving="..." :error="..."
//                      @price="(id, value) => ..." @confirm="..." @keep="..." @close="..." />
//
//   group   { key, linked, fileName, percent, items } (see ApprovalView's reviewGroups)
//   prices  what's in each price box: { [item id]: '123.45' }
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { NO_CATEGORY, fetchCategories } from '../lib/categories'
import { count, peso } from '../lib/format'
import { isPrice, profitPercent, startingPrice } from '../lib/receiptPrices'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  group: { type: Object, required: true },
  prices: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  // why Confirm / Keep didn't work (shown in the window, not behind it)
  error: { type: String, default: '' },
})

const emit = defineEmits(['price', 'confirm', 'keep', 'close'])

const items = computed(() => props.group.items || [])

/* ------------------------------------------------------------------
   The receipt at a glance
------------------------------------------------------------------ */
const title = computed(() =>
  props.group.linked ? props.group.fileName || `Receipt #${props.group.key}` : 'Added without your approval'
)

const newCount = computed(() => items.value.filter((item) => item.is_new).length)
const restockCount = computed(() => items.value.length - newCount.value)
const piecesAdded = computed(() => items.value.reduce((sum, item) => sum + Number(item.qty_added || 0), 0))

const chosenPercent = computed(() => {
  const percent = Number(props.group.percent)
  return props.group.percent != null && Number.isFinite(percent) ? percent : null
})

/* ------------------------------------------------------------------
   Prices
------------------------------------------------------------------ */
function priceOf(item) {
  return props.prices[item.id] ?? ''
}

function isValid(item) {
  return isPrice(priceOf(item))
}

// the price will change when confirmed
function isChanged(item) {
  return isValid(item) && Number(priceOf(item)) !== Number(item.price)
}

// typed over the suggested price: offer to put it back
function canReset(item) {
  return String(priceOf(item)) !== startingPrice(item)
}

const changedCount = computed(() => items.value.filter(isChanged).length)
const allValid = computed(() => items.value.every(isValid))

function profitOf(item) {
  return profitPercent(item.cost, priceOf(item))
}

function profitText(item) {
  const profit = profitOf(item)
  if (profit === null) return 'No cost'
  return `${profit > 0 ? '+' : ''}${profit}%`
}

// red: a loss · amber: less than the profit chosen · green: at least that
function profitTone(item) {
  const profit = profitOf(item)
  if (profit === null) return 'bg-white/5 text-zinc-400'
  if (profit < 0) return 'bg-red-600/15 text-red-400'
  if (chosenPercent.value !== null && profit < chosenPercent.value) return 'bg-yellow-500/15 text-yellow-400'
  return 'bg-emerald-600/15 text-emerald-400'
}

/* ------------------------------------------------------------------
   Categories: the owner's list, and each product's (found by its id, or
   else by its exact name when only one product has it)
------------------------------------------------------------------ */
const categories = ref(null) // null: still loading, or the categories SQL wasn't run
const products = ref([])
const loaded = ref(false)
const categoryEdits = ref({}) // product id -> category picked here
const categoryState = ref({}) // product id -> 'saving' | 'saved' | an error
const savedTimers = new Map()

function sameName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

const productsById = computed(() => new Map(products.value.map((product) => [String(product.id), product])))

const productsByName = computed(() => {
  const map = new Map()
  for (const product of products.value) {
    const key = sameName(product.name)
    map.set(key, map.has(key) ? null : product) // two with one name: can't tell which
  }
  return map
})

function productOf(item) {
  if (item.product_id != null) return productsById.value.get(String(item.product_id)) || null
  return productsByName.value.get(sameName(item.product_name)) || null
}

function categoryOf(item) {
  const product = productOf(item)
  if (!product) return null
  return categoryEdits.value[product.id] ?? (product.category || NO_CATEGORY)
}

// an old category name that isn't in the owner's list (any more)
function isUnlisted(item) {
  const value = categoryOf(item)
  return value !== NO_CATEGORY && !(categories.value || []).some((category) => category.name === value)
}

function stateOf(item) {
  const product = productOf(item)
  return product ? categoryState.value[product.id] : undefined
}

const uncategorized = computed(() => items.value.filter((item) => productOf(item) && categoryOf(item) === NO_CATEGORY))

function setState(productId, state) {
  categoryState.value = { ...categoryState.value, [productId]: state }
}

async function setCategory(item, value) {
  const product = productOf(item)
  const before = categoryOf(item)
  if (!product || !value || value === before) return

  categoryEdits.value = { ...categoryEdits.value, [product.id]: value }
  setState(product.id, 'saving')

  const { data: saved, error } = await supabase.rpc('admin_set_product_category', {
    p_product_id: Number(product.id),
    p_category: value === NO_CATEGORY ? '' : value,
  })

  if (error) {
    categoryEdits.value = { ...categoryEdits.value, [product.id]: before }
    setState(product.id, `Not saved: ${error.message}`)
    return
  }

  // the name as the database keeps it (e.g. its own spelling of the category)
  categoryEdits.value = { ...categoryEdits.value, [product.id]: saved || value }
  setState(product.id, 'saved')

  clearTimeout(savedTimers.get(product.id))
  savedTimers.set(
    product.id,
    setTimeout(() => {
      if (categoryState.value[product.id] === 'saved') setState(product.id, undefined)
    }, 2500)
  )
}

// "Put them all in …": every product of this receipt that has no category
async function setAllUncategorized(event) {
  const value = event.target.value
  event.target.value = ''
  if (!value) return

  await Promise.all(uncategorized.value.map((item) => setCategory(item, value)))
}

/* ------------------------------------------------------------------
   Opening
------------------------------------------------------------------ */
const closeButton = ref(null)

onMounted(async () => {
  // a mouse: the close button gets the focus (Esc closes; on a phone this
  // would pop up the keyboard if it went to a price box)
  if (window.matchMedia?.('(pointer: fine)').matches) nextTick(() => closeButton.value?.focus({ preventScroll: true }))

  const [list, result] = await Promise.all([
    fetchCategories(),
    supabase.rpc('list_products', { p_filter: 'active', p_order_by: 'id_asc' }),
  ])

  categories.value = list
  products.value = result.data || []
  if (result.error) console.error('Products for the categories:', result.error)
  loaded.value = true
})

onBeforeUnmount(() => {
  for (const timer of savedTimers.values()) clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[1950] flex items-center justify-center bg-black/80 p-2 sm:p-4"
      @click.self="emit('close')"
    >
      <div
        class="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-check-title"
      >
        <!-- ============================================================
             HEADER: which receipt, and what it did
        ============================================================ -->
        <header class="border-b border-white/5 px-4 py-4 sm:px-6">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="eyebrow">Check prices</p>
              <h2 id="price-check-title" class="mt-0.5 truncate text-xl font-extrabold text-white sm:text-2xl">
                {{ title }}
              </h2>
            </div>

            <button
              ref="closeButton"
              type="button"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label="Close"
              @click="emit('close')"
            >
              ✕
            </button>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <span v-if="group.linked" class="pill bg-emerald-600/15 text-emerald-300">
              Profit chosen: {{ chosenPercent !== null ? chosenPercent + '%' : '—' }}
            </span>
            <span class="pill bg-white/5 text-zinc-300">
              {{ count(items.length) }} product{{ items.length === 1 ? '' : 's' }}
            </span>
            <span v-if="newCount > 0" class="pill bg-sky-500/15 text-sky-300">{{ count(newCount) }} new</span>
            <span v-if="restockCount > 0" class="pill bg-white/5 text-zinc-300">{{ count(restockCount) }} restocked</span>
            <span class="pill bg-white/5 text-zinc-300">+{{ count(piecesAdded) }} pcs added</span>
          </div>

          <p
            v-if="!group.linked"
            class="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200"
          >
            <NavIcon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
            The receipt scanner added these on its own, not from a receipt you approved, so no
            profit was added. Check each price before confirming.
          </p>
        </header>

        <!-- products with no category yet: one category for all of them -->
        <div
          v-if="categories && uncategorized.length >= 2"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/5 bg-amber-500/[0.06] px-4 py-2.5 text-sm sm:px-6"
        >
          <span class="text-amber-200">
            <b>{{ count(uncategorized.length) }}</b> products have no category.
          </span>
          <label class="flex items-center gap-2 text-zinc-300">
            Put them all in
            <select class="field-select" aria-label="Category for all products with none" @change="setAllUncategorized">
              <option value="">Choose…</option>
              <option v-for="category in categories" :key="category.id" :value="category.name">
                {{ category.name }}
              </option>
            </select>
          </label>
        </div>

        <!-- ============================================================
             THE PRODUCTS (rows become cards on phones: resp-table)
        ============================================================ -->
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <table class="data-table resp-table price-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th class="num">Cost</th>
                <th class="num">Price now</th>
                <th class="num">New price</th>
                <th class="num">Profit</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td class="cell-main">
                  <div class="min-w-0">
                    <p class="font-bold leading-snug text-white">{{ item.product_name || 'Product' }}</p>
                    <p class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                      <span class="badge" :class="item.is_new ? 'bg-sky-500/20 text-sky-300' : 'bg-amber-500/20 text-amber-300'">
                        {{ item.is_new ? 'New' : 'Restock' }}
                      </span>
                      +{{ count(item.qty_added) }} pcs
                    </p>
                  </div>
                </td>

                <td data-label="Category">
                  <div v-if="productOf(item)" class="category-cell">
                    <select
                      v-if="categories"
                      class="field-select"
                      :class="{ 'is-none': categoryOf(item) === NO_CATEGORY }"
                      :value="categoryOf(item)"
                      :disabled="stateOf(item) === 'saving'"
                      :aria-label="'Category of ' + (item.product_name || 'this product')"
                      @change="setCategory(item, $event.target.value)"
                    >
                      <option :value="NO_CATEGORY">{{ NO_CATEGORY }}</option>
                      <option v-for="category in categories" :key="category.id" :value="category.name">
                        {{ category.name }}
                      </option>
                      <option v-if="isUnlisted(item)" :value="categoryOf(item)">{{ categoryOf(item) }}</option>
                    </select>
                    <span v-else class="text-sm text-zinc-300">{{ categoryOf(item) }}</span>

                    <span v-if="stateOf(item) === 'saved'" class="whitespace-nowrap text-xs font-bold text-emerald-400">
                      ✓ Saved
                    </span>
                    <span
                      v-else-if="stateOf(item) && stateOf(item) !== 'saving'"
                      class="text-xs text-red-400"
                      role="alert"
                    >
                      {{ stateOf(item) }}
                    </span>
                  </div>
                  <span v-else-if="!loaded" class="text-xs text-zinc-500">Loading…</span>
                  <span
                    v-else
                    class="text-xs text-zinc-500"
                    title="This product wasn't found in Inventory by its name. Set its category in Inventory."
                  >
                    Set in Inventory
                  </span>
                </td>

                <td data-label="Cost" class="num text-sm text-zinc-300">
                  {{ item.cost != null ? peso(item.cost) : '—' }}
                </td>

                <td data-label="Price now" class="num text-sm text-zinc-300">
                  <template v-if="item.is_new">
                    <span class="text-zinc-500">New</span>
                  </template>
                  <template v-else>{{ peso(item.price) }}</template>
                </td>

                <td data-label="New price" class="num">
                  <div class="price-cell">
                    <div class="price-box" :class="{ 'is-changed': isChanged(item), 'is-invalid': !isValid(item) }">
                      <span aria-hidden="true">₱</span>
                      <input
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.01"
                        :value="priceOf(item)"
                        :aria-label="'New price of ' + (item.product_name || 'this product')"
                        @input="emit('price', item.id, $event.target.value)"
                      />
                    </div>
                    <button
                      v-if="canReset(item)"
                      type="button"
                      class="reset-link"
                      :title="'Back to ' + peso(startingPrice(item))"
                      @click="emit('price', item.id, startingPrice(item))"
                    >
                      Reset
                    </button>
                  </div>
                </td>

                <td data-label="Profit" class="num">
                  <span class="badge" :class="profitTone(item)">{{ profitText(item) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ============================================================
             FOOTER: what Confirm will do
        ============================================================ -->
        <footer
          class="flex flex-col gap-3 border-t border-white/5 bg-zinc-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4"
        >
          <div class="min-w-0 text-sm">
            <p v-if="error" class="font-bold text-red-400" role="alert">{{ error }}</p>
            <p v-else-if="!allValid" class="font-bold text-red-400">Every price must be a number, 0 or more.</p>
            <p v-else class="text-zinc-400">
              <b class="text-white">{{ count(changedCount) }}</b> of {{ count(items.length) }}
              price{{ items.length === 1 ? '' : 's' }} will change. Categories save as you pick them.
            </p>
          </div>

          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              class="flex-1 rounded-2xl bg-zinc-800 px-5 py-3 font-bold text-white hover:bg-zinc-700 disabled:opacity-50 sm:flex-none"
              :disabled="saving"
              title="Close this check without changing any price"
              @click="emit('keep')"
            >
              Keep current prices
            </button>
            <button
              type="button"
              class="flex-1 rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
              :disabled="saving || !allValid"
              @click="emit('confirm')"
            >
              {{ saving ? 'Saving…' : 'Confirm prices' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.eyebrow {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border-radius: 999px;
  padding: 0.12rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* the header row stays in view while the products scroll */
.price-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);
}

.price-table td {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.category-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.6rem;
}

.field-select {
  max-width: 13rem;
  cursor: pointer;
  border-radius: 0.65rem;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  color: var(--color-zinc-200);
  outline: none;
}

.field-select:hover,
.field-select:focus-visible {
  border-color: rgba(224, 27, 50, 0.45);
}

.field-select.is-none {
  color: var(--color-yellow-400);
}

.field-select:disabled {
  cursor: wait;
  opacity: 0.6;
}

.field-select option {
  background: var(--surface);
  color: #fff;
}

.price-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
}

/* "₱ 1,234.50" box; amber when the price will change, red when it isn't a price */
.price-box {
  display: inline-flex;
  width: 8.5rem;
  align-items: center;
  gap: 0.3rem;
  border-radius: 0.7rem;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
  padding: 0 0.65rem;
  color: var(--color-zinc-400);
}

.price-box:focus-within {
  border-color: rgba(224, 27, 50, 0.55);
  box-shadow: 0 0 0 3px rgba(224, 27, 50, 0.16);
}

.price-box.is-changed {
  border-color: rgba(251, 191, 36, 0.65);
}

.price-box.is-invalid {
  border-color: rgba(239, 68, 68, 0.85);
}

.price-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0.5rem 0;
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #fff;
  outline: none;
  -moz-appearance: textfield;
  appearance: textfield;
}

.price-box input:focus {
  box-shadow: none;
}

.price-box input::-webkit-outer-spin-button,
.price-box input::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

.reset-link {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-zinc-400);
}

.reset-link:hover {
  color: #fff;
}

/* phones: each product a card (resp-table); the boxes take the room */
@media (max-width: 760px) {
  .price-table td {
    padding-top: 0.3rem;
    padding-bottom: 0.3rem;
  }

  .field-select {
    max-width: 60vw;
  }
}
</style>
