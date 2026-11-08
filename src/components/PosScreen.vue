<template>
  <!-- The Point of Sale, for the Owner (owner: refunds at once, can enable a
       disabled product) and the Cashier. Products on the left, the current
       sale on the right (on phones: a sheet from the bar at the bottom). -->
  <div>
    <PageHeader title="Point of Sale" subtitle="Cashier product sales and stock-out system." />

    <!-- pb-24 on phones: room for the cart bar fixed at the bottom -->
    <div class="grid gap-6 pb-24 lg:grid-cols-[1fr_380px] lg:pb-0">
      <!-- PRODUCTS (a new page scrolls back up to the search box) -->
      <div ref="productsTop" class="min-w-0 scroll-mt-4">
        <div class="mb-5 flex gap-2">
          <input
            maxlength="80"
            v-model="searchQuery"
            type="text"
            placeholder="Search product..."
            class="min-w-0 flex-1 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-red-600"
          />
          <!-- a customer brings something back: refund it (the Owner's is applied at once) -->
          <button
            type="button"
            class="shrink-0 rounded-2xl border border-amber-500/40 px-4 py-3 font-bold text-amber-300 hover:bg-amber-500/10 hover:text-white"
            title="A customer returned a product: refund it"
            @click="refundOpen = true"
          >
            Refund
          </button>
        </div>

        <RefundRequestModal v-if="refundOpen" :owner="owner" @close="refundOpen = false" @sent="refundSent" />

        <p v-if="loading" class="text-zinc-400">Loading products...</p>

        <!-- categories: only the ones that have products, with how many -->
        <div v-if="categoryTabs.length > 2" class="category-row -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-2" role="group" aria-label="Category">
          <button
            v-for="tab in categoryTabs"
            :key="tab.name"
            type="button"
            class="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition"
            :class="selectedCategory === tab.name ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'"
            :aria-pressed="selectedCategory === tab.name"
            @click="selectedCategory = tab.name"
          >
            {{ tab.name }}
            <span class="text-xs font-semibold" :class="selectedCategory === tab.name ? 'text-white/80' : 'text-zinc-500'">{{ count(tab.count) }}</span>
          </button>
        </div>

        <!-- what Disable / Enable just did -->
        <p v-if="posNotice" class="mb-4 rounded-xl p-3 text-sm" :class="posNotice.ok ? 'bg-emerald-600/15 text-emerald-300' : 'bg-red-600/15 text-red-400'" role="status">
          {{ posNotice.text }}
        </p>

        <!-- 2 a row on phones, up to 4: the columns follow the width of this
             area (it shares the screen with the cart), not the whole window.
             Below 440px the cards are smaller (less padding, smaller text). -->
        <div class="@container">
          <div class="grid grid-cols-2 gap-3 @min-[440px]:gap-4 @min-[640px]:grid-cols-3 @min-[780px]:grid-cols-4">
            <div
              v-for="product in visibleProducts"
              :key="product.id"
              class="card flex min-w-0 flex-col p-2.5 @min-[440px]:p-4"
              :class="{ 'border-red-500/40': infoFor(product) }"
            >
              <div class="relative">
                <img
                  :src="product.image_url || 'https://via.placeholder.com/300x200'"
                  :alt="product.name"
                  class="mb-2 aspect-[4/3] w-full shrink-0 rounded-xl object-cover @min-[440px]:mb-3 @min-[440px]:aspect-auto @min-[440px]:h-[140px] @min-[440px]:rounded-2xl"
                  :class="{ 'opacity-40 grayscale': infoFor(product) }"
                  loading="lazy"
                />
                <PreviewButton v-if="product.image_url" :src="product.image_url" :alt="product.name" />
                <!-- disabled: can't be sold until the owner enables it -->
                <span
                  v-if="infoFor(product)"
                  class="absolute left-2 top-2 rounded-full bg-red-600 px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider text-white shadow-lg"
                >
                  Disabled
                </span>
              </div>

              <h2 class="line-clamp-2 min-h-[2.75em] text-sm font-bold leading-snug text-white @min-[440px]:text-lg">
                {{ product.name }}
              </h2>
              <p class="truncate text-xs text-zinc-400 @min-[440px]:text-sm">
                {{ product.category || 'Uncategorized' }}
              </p>

              <!-- mt-auto pins stock, price and the button to the bottom, so they
                   line up across the row no matter how long the product name is -->
              <div class="mt-auto pt-2 @min-[440px]:pt-3">
                <p class="text-xs text-zinc-300 @min-[440px]:text-sm">Stock: {{ count(product.quantity) }}</p>
                <p class="text-sm font-bold text-red-400">
                  {{ peso(product.price || 0) }}
                </p>
              </div>

              <!-- disabled: the reason, and no Add to Cart -->
              <p v-if="infoFor(product)" class="mt-1 line-clamp-2 text-xs font-bold text-red-300" :title="infoFor(product).reason">
                {{ infoFor(product).reason }}
              </p>

              <template v-if="infoFor(product)">
                <!-- the Owner can sell it again; a Cashier can't -->
                <button
                  v-if="owner"
                  type="button"
                  class="mt-2 w-full shrink-0 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 @min-[440px]:mt-3 @min-[440px]:text-base"
                  :disabled="enablingId === product.id"
                  @click="enableProduct(product)"
                >
                  {{ enablingId === product.id ? 'Enabling…' : 'Enable' }}
                </button>
                <button
                  v-else
                  type="button"
                  class="mt-2 w-full shrink-0 cursor-not-allowed rounded-xl bg-zinc-800 py-2 text-sm font-bold text-zinc-400 @min-[440px]:mt-3 @min-[440px]:text-base"
                  disabled
                  :title="infoFor(product).reason"
                >
                  Disabled
                </button>
              </template>

              <template v-else>
                <button
                  class="mt-2 w-full shrink-0 rounded-xl bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 @min-[440px]:mt-3 @min-[440px]:text-base"
                  :disabled="product.quantity <= 0 || checkingOut"
                  @click="addToCart(product)"
                >
                  {{ product.quantity <= 0 ? 'Out of Stock' : 'Add to Cart' }}
                </button>

                <!-- damaged, expired, wrong price...: take it off sale and tell the owner -->
                <button
                  type="button"
                  class="mt-1.5 w-full text-xs font-bold text-zinc-500 hover:text-red-400"
                  @click="askDisable(product)"
                >
                  Disable product
                </button>
              </template>
            </div>
          </div>
        </div>

        <!-- 16 or 24 products a page (4 full rows), or all of them -->
        <TablePager
          v-if="filteredProducts.length > 0"
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="filteredProducts.length"
          :sizes="GRID_PAGE_SIZES"
          label="Per page"
          noun="products"
          card
          class="mt-5"
        />

        <p v-else-if="!loading" class="card p-5 text-zinc-400">
          {{ products.length > 0 ? 'No product matches your search.' : 'No products to show.' }}
        </p>
      </div>

      <!-- CURRENT SALE: beside the products on wide screens; on phones a sheet -->
      <aside
        class="sale-panel"
        :class="showCart ? 'is-open' : 'max-lg:hidden'"
        aria-label="Current sale"
      >
        <header class="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 class="text-lg font-extrabold text-white">Current sale</h2>
            <p class="text-xs text-zinc-500">{{ cartCount ? `${count(cartCount)} item${cartCount === 1 ? '' : 's'}` : 'Add a product to start' }}</p>
          </div>
          <div class="flex items-center gap-1">
            <button
              v-if="cart.length"
              type="button"
              class="rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-400 hover:bg-white/5 hover:text-red-300 disabled:opacity-50"
              :disabled="checkingOut"
              @click="clearCart"
            >
              Clear
            </button>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700 lg:hidden"
              aria-label="Close the sale"
              @click="showCart = false"
            >
              ✕
            </button>
          </div>
        </header>

        <!-- the items -->
        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div v-if="cart.length === 0" class="grid h-full min-h-[10rem] place-items-center text-center">
            <div>
              <span class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5 text-zinc-500">
                <NavIcon name="pos" class="h-6 w-6" />
              </span>
              <p class="mt-3 text-sm font-bold text-zinc-300">No items yet</p>
              <p class="text-xs text-zinc-500">Products you add show up here.</p>
            </div>
          </div>

          <ul v-else class="space-y-2">
            <li v-for="item in cart" :key="item.id" class="line">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-white" :title="item.name">{{ item.name }}</p>
                <p class="text-xs text-zinc-500">{{ peso(item.price) }} each</p>

                <div class="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    class="step"
                    :disabled="checkingOut"
                    :aria-label="`One less ${item.name}`"
                    @click="decreaseQty(item.id)"
                  >
                    −
                  </button>
                  <input
                    v-model.number="item.cartQty"
                    type="number"
                    min="1"
                    step="1"
                    :max="item.quantity"
                    class="qty"
                    :aria-label="`How many ${item.name}`"
                    :disabled="checkingOut"
                    @change="validateQty(item)"
                  />
                  <button
                    type="button"
                    class="step"
                    :disabled="checkingOut || item.cartQty >= item.quantity"
                    :aria-label="`One more ${item.name}`"
                    @click="increaseQty(item.id)"
                  >
                    +
                  </button>
                </div>
              </div>

              <div class="flex shrink-0 flex-col items-end justify-between gap-2">
                <button
                  type="button"
                  class="grid h-6 w-6 place-items-center rounded-full text-zinc-500 hover:bg-red-500/15 hover:text-red-300"
                  :aria-label="`Remove ${item.name}`"
                  :disabled="checkingOut"
                  @click="removeFromCart(item.id)"
                >
                  ✕
                </button>
                <p class="text-sm font-extrabold text-white">{{ peso(item.price * item.cartQty) }}</p>
              </div>
            </li>
          </ul>
        </div>

        <!-- total and Charge -->
        <footer class="border-t border-white/5 px-5 py-4">
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between text-zinc-400">
              <dt>Items</dt>
              <dd>{{ count(cartCount) }}</dd>
            </div>
            <div class="flex items-baseline justify-between pt-1">
              <dt class="font-bold text-white">Total</dt>
              <dd class="text-2xl font-extrabold text-white">{{ peso(totalAmount) }}</dd>
            </div>
          </dl>

          <p v-if="errorMessage" class="mt-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">
            {{ errorMessage }}
          </p>

          <button
            type="button"
            class="charge-btn mt-4"
            :disabled="cart.length === 0 || checkingOut"
            @click="checkout"
          >
            {{ checkingOut ? 'Processing…' : cart.length ? `Charge ${peso(totalAmount)}` : 'Charge' }}
          </button>
        </footer>
      </aside>
    </div>

    <!-- PHONES: the sale is always one tap away -->
    <div
      v-if="showCart"
      class="fixed inset-0 z-40 bg-black/60 lg:hidden"
      @click="showCart = false"
    ></div>

    <button
      v-else
      type="button"
      class="cart-bar lg:hidden"
      @click="showCart = true"
    >
      <span class="flex items-center gap-2">
        <span class="grid h-7 min-w-7 place-items-center rounded-full bg-white px-1.5 text-sm font-extrabold text-red-600">{{ count(cartCount) }}</span>
        View sale
      </span>
      <span>{{ peso(totalAmount) }}</span>
    </button>

    <!-- DISABLE A PRODUCT -->
    <DisableProductModal
      v-if="disableTarget"
      :product="disableTarget"
      :busy="disableBusy"
      :error="disableError"
      @confirm="confirmDisable"
      @cancel="cancelDisable"
    />

    <!-- RECEIPT MODAL -->
    <div
      v-if="receipt"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <!-- like Sales History's: the receipt scrolls, Close / Print stay in view -->
      <div
        class="flex max-h-[92vh] w-full max-w-md flex-col rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-label="`Receipt of sale #${receipt.id}`"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Receipt</p>
            <h2 class="text-xl font-extrabold text-white">Sale #{{ receipt.id }}</h2>
            <p class="text-xs text-zinc-400">{{ formatDate(receipt.created_at) }} · {{ receiptCashier }}</p>
          </div>
          <span class="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
            <i class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true"></i>Paid
          </span>
        </div>

        <div class="min-h-0 overflow-y-auto">
        <div id="receiptArea" class="rounded-2xl bg-white p-5 text-black">
          <div class="text-center">
            <h2 class="text-2xl font-extrabold">10 FIVE 7 Hardware</h2>
            <p class="text-sm">Inventory Management System</p>
            <p class="mt-2 text-xs">Sales Receipt</p>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="text-sm">
            <p><strong>Sale No:</strong> #{{ receipt.id }}</p>
            <p><strong>Date:</strong> {{ formatDate(receipt.created_at) }}</p>
            <p><strong>Cashier:</strong> {{ receiptCashier }}</p>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="space-y-3">
            <div v-for="item in receipt.items" :key="item.product_id" class="text-sm">
              <div class="flex justify-between gap-3">
                <p class="font-bold">{{ item.product_name }}</p>
                <p>{{ peso(item.subtotal) }}</p>
              </div>
              <p class="text-xs">Qty: {{ count(item.quantity) }} × {{ peso(item.price) }}</p>
            </div>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>{{ peso(receipt.total_amount) }}</span>
          </div>

          <p class="mt-5 text-center text-xs">Thank you for your purchase!</p>
        </div>
        </div>

        <div class="mt-4 grid shrink-0 grid-cols-2 gap-3">
          <button class="rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700" @click="receipt = null">
            Close
          </button>
          <button class="rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700" @click="printReceipt">
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { heldProductIds, withoutHeld } from '../lib/heldProducts'
import { GRID_PAGE_SIZES, usePagination } from '../lib/usePagination'
import { printElement } from '../lib/printReceipt'
import { count, peso } from '../lib/format'
import { NO_CATEGORY } from '../lib/categories'
import { stockOf } from '../lib/stock'
import { readCurrentUser } from '../lib/currentUser'
import { useDisabledProducts } from '../lib/disabledProducts'
import TablePager from './TablePager.vue'
import PreviewButton from './PreviewButton.vue'
import PageHeader from './PageHeader.vue'
import NavIcon from './NavIcon.vue'
import DisableProductModal from './DisableProductModal.vue'
import RefundRequestModal from './RefundRequestModal.vue'

const props = defineProps({
  // the Owner's POS: refunds at once, and can enable a disabled product
  owner: { type: Boolean, default: false },
})

const products = ref([])
const cart = ref([])

const searchQuery = ref('')
const loading = ref(false)
// While a sale is being processed the cart is locked: changes made in that
// moment were wiped when the sale finished, without being sold.
const checkingOut = ref(false)

const errorMessage = ref('')
const receipt = ref(null)

// phones: the sale opens as a sheet from the bar at the bottom of the screen
const showCart = ref(false)
const cartCount = computed(() => cart.value.reduce((sum, item) => sum + Number(item.cartQty || 0), 0))

// The seller's name on the receipt, as the sale saved it (no name: just
// "Owner" / "Cashier")
const receiptCashier = computed(() => {
  const name = String(receipt.value?.cashier_name || '').trim()
  return name && !name.includes('@') ? name : props.owner ? 'Owner' : 'Cashier'
})

/* ---- categories: All, then each one that has products (A-Z, Uncategorized last) ---- */
const ALL_CATEGORIES = 'All'
const selectedCategory = ref(ALL_CATEGORIES)

function categoryOf(product) {
  return String(product.category || '').trim() || NO_CATEGORY
}

const categoryTabs = computed(() => {
  const counts = new Map()
  for (const product of products.value) {
    const name = categoryOf(product)
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  const names = [...counts.keys()].sort((a, b) =>
    a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b)
  )
  return [
    { name: ALL_CATEGORIES, count: products.value.length },
    ...names.map((name) => ({ name, count: counts.get(name) })),
  ]
})

// the chosen category disappeared (its last product sold out of the list)
watch(categoryTabs, (tabs) => {
  if (!tabs.some((tab) => tab.name === selectedCategory.value)) selectedCategory.value = ALL_CATEGORIES
})

const filteredProducts = computed(() => {
  const search = searchQuery.value.toLowerCase().trim()
  const inCategory =
    selectedCategory.value === ALL_CATEGORIES
      ? products.value
      : products.value.filter((product) => categoryOf(product) === selectedCategory.value)

  if (!search) return inCategory

  return inCategory.filter(
    (product) => product.name?.toLowerCase().includes(search) || product.category?.toLowerCase().includes(search)
  )
})

// 16 or 24 products a page, or all of them (remembered on this device)
const productsTop = ref(null)
const {
  page,
  pageSize,
  visible: visibleProducts,
  reset: resetPage,
} = usePagination(filteredProducts, { storageKey: 'pos', scrollTarget: productsTop, sizes: GRID_PAGE_SIZES })

// a new search or category starts again at page 1
watch([searchQuery, selectedCategory], resetPage)

const totalAmount = computed(() =>
  cart.value.reduce((total, item) => total + Number(item.price || 0) * Number(item.cartQty || 0), 0)
)

/* ------------------------------------------------------------------
   Disable a product (lib/disabledProducts.js): it can't be sold until the
   owner enables it again, and the owner is told.
------------------------------------------------------------------ */
const { load: loadDisabled, infoFor, disable, enable } = useDisabledProducts()
const disableTarget = ref(null)
const disableBusy = ref(false)
const disableError = ref('')
const enablingId = ref(null)
const posNotice = ref(null) // { ok, text }

// Refund (components/RefundRequestModal.vue; the Owner's is applied at once)
const refundOpen = ref(false)

function refundSent(text) {
  refundOpen.value = false
  posNotice.value = { ok: true, text }
  if (props.owner) fetchProducts()
}

function askDisable(product) {
  disableError.value = ''
  disableTarget.value = product
}

function cancelDisable() {
  if (disableBusy.value) return
  disableTarget.value = null
}

async function confirmDisable(reason) {
  const product = disableTarget.value
  if (!product || disableBusy.value) return
  disableBusy.value = true
  disableError.value = ''

  try {
    await disable(product, reason)
    // it can't be sold now: out of the cart too
    cart.value = cart.value.filter((item) => item.id !== product.id)
    disableTarget.value = null
    posNotice.value = { ok: true, text: `"${product.name}" is disabled. The owner was notified.` }
  } catch (err) {
    disableError.value = err.message
  } finally {
    disableBusy.value = false
  }
}

async function enableProduct(product) {
  if (!props.owner || enablingId.value) return
  enablingId.value = product.id
  posNotice.value = null

  try {
    await enable(product)
    posNotice.value = { ok: true, text: `"${product.name}" is enabled and can be sold again.` }
  } catch (err) {
    posNotice.value = { ok: false, text: err.message }
  } finally {
    enablingId.value = null
  }
}

async function fetchProducts() {
  loading.value = true

  loadDisabled()

  // without products that exist by name only (lib/heldProducts.js)
  const [{ data, error }, held] = await Promise.all([
    supabase.rpc('list_products', { p_filter: 'active', p_order_by: 'id_desc' }),
    heldProductIds(),
  ])

  if (error) {
    errorMessage.value = error.message
    products.value = []
  } else {
    products.value = withoutHeld(data, held)
  }

  loading.value = false
}

/* ---- the sale ---- */
function addToCart(product) {
  if (checkingOut.value) return // cart locked while the sale is processed

  errorMessage.value = ''

  if (infoFor(product)) {
    errorMessage.value = "This product is disabled and can't be sold."
    return
  }

  if (stockOf(product) <= 0) {
    errorMessage.value = 'This product is out of stock.'
    return
  }

  const existing = cart.value.find((item) => item.id === product.id)

  if (existing) {
    if (existing.cartQty >= product.quantity) {
      errorMessage.value = `Only ${count(product.quantity)} of "${product.name}" in stock.`
      return
    }
    existing.cartQty += 1
    return
  }

  cart.value.push({ ...product, price: Number(product.price || 0), cartQty: 1 })
}

function removeFromCart(productId) {
  if (checkingOut.value) return
  cart.value = cart.value.filter((item) => item.id !== productId)
}

function increaseQty(productId) {
  if (checkingOut.value) return
  const item = cart.value.find((item) => item.id === productId)
  if (!item) return

  if (item.cartQty >= item.quantity) {
    errorMessage.value = `Only ${count(item.quantity)} of "${item.name}" in stock.`
    return
  }
  item.cartQty += 1
}

function decreaseQty(productId) {
  if (checkingOut.value) return
  const item = cart.value.find((item) => item.id === productId)
  if (!item) return

  if (item.cartQty <= 1) {
    removeFromCart(productId)
    return
  }
  item.cartQty -= 1
}

function validateQty(item) {
  if (checkingOut.value) return

  // whole items only: 1.5 used to reach checkout and fail there
  item.cartQty = Math.floor(Number(item.cartQty) || 0)
  if (item.cartQty < 1) item.cartQty = 1

  if (item.cartQty > item.quantity) {
    item.cartQty = item.quantity
    errorMessage.value = 'Quantity adjusted to the stock there is.'
  }
}

function clearCart() {
  if (checkingOut.value) return
  cart.value = []
  errorMessage.value = ''
}

// who is selling: the account's current name (lib/currentUser.js), or the login
async function seller() {
  const saved = readCurrentUser()
  if (saved?.id) {
    return { id: saved.id, name: saved.full_name || (props.owner ? 'Owner' : 'Cashier'), email: saved.email || '' }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user?.id) return null
  return { id: user.id, name: user.user_metadata?.full_name || (props.owner ? 'Owner' : 'Cashier'), email: user.email || '' }
}

async function checkout() {
  if (cart.value.length === 0 || checkingOut.value) return

  checkingOut.value = true
  errorMessage.value = ''

  const who = await seller()
  if (!who) {
    errorMessage.value = 'No account detected. Please log in again.'
    checkingOut.value = false
    return
  }

  const { data: sale, error: saleError } = await supabase.rpc('process_sale', {
    p_cashier_id: who.id,
    p_cashier_name: who.name,
    p_cashier_email: who.email,
    p_items: cart.value.map((item) => ({ product_id: item.id, quantity: item.cartQty })),
  })

  if (saleError) {
    // e.g. "Insufficient stock for ...", "Product ... not found or unavailable"
    errorMessage.value = saleError.message
    checkingOut.value = false
    return
  }

  receipt.value = {
    ...sale,
    // the sale result has no time of its own ("Invalid Date" on the receipt)
    created_at: sale.created_at || new Date().toISOString(),
    items: sale.items,
  }

  showCart.value = false // the receipt shows next
  cart.value = []

  await fetchProducts()
  checkingOut.value = false
}

// "Nov 8, 2026, 8:07 PM", like Sales History's receipt
function formatDate(date) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function printReceipt() {
  printElement('receiptArea')
}

onMounted(fetchProducts)
</script>

<style scoped>
/* the category buttons: one row, scrolled sideways (a thin bar shows
   there's more; drag, swipe or shift + wheel) */
.category-row {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  scroll-snap-type: x proximity;
}

.category-row > button {
  scroll-snap-align: start;
}

/* the current sale */
.sale-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--hairline);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

@media (min-width: 1024px) {
  .sale-panel {
    position: sticky;
    top: 1rem;
    /* fits the window under the page title, so Charge is always on screen */
    height: calc(100vh - 12rem);
    min-height: 26rem;
    max-height: 760px;
  }
}

@media (max-width: 1023px) {
  .sale-panel.is-open {
    position: fixed;
    right: 0;
    bottom: 0;
    left: var(--side);
    z-index: 50;
    max-height: 85vh;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.line {
  display: flex;
  gap: 0.75rem;
  border-radius: 0.9rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.7rem 0.8rem;
}

.step {
  display: grid;
  height: 1.9rem;
  width: 1.9rem;
  place-items: center;
  border-radius: 0.55rem;
  background: var(--color-zinc-800);
  font-weight: 800;
  color: #fff;
}

.step:hover:not(:disabled) {
  background: var(--color-zinc-700);
}

.step:disabled {
  opacity: 0.4;
}

.qty {
  height: 1.9rem;
  width: 3rem;
  border-radius: 0.55rem;
  border: 1px solid var(--hairline);
  background: transparent;
  text-align: center;
  font-weight: 700;
  color: #fff;
  outline: none;
}

.qty:focus {
  border-color: rgba(224, 27, 50, 0.55);
}

.charge-btn {
  width: 100%;
  border-radius: 0.9rem;
  background: var(--brand);
  padding: 0.95rem;
  font-size: 1rem;
  font-weight: 800;
  color: #fff;
  box-shadow: 0 8px 20px -10px rgba(224, 27, 50, 0.8);
  transition: background-color 0.15s;
}

.charge-btn:hover:not(:disabled) {
  background: var(--brand-bright);
}

.charge-btn:disabled {
  opacity: 0.5;
  box-shadow: none;
}

/* phones: the bar at the bottom */
.cart-bar {
  position: fixed;
  right: 0.75rem;
  bottom: 0.75rem;
  left: calc(var(--side) + 0.75rem);
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 1rem;
  background: var(--brand);
  padding: 0.85rem 1.1rem;
  font-weight: 800;
  color: #fff;
  box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.7);
}

/* computers: the sale is always beside the products */
@media (min-width: 1024px) {
  .cart-bar {
    display: none;
  }
}
</style>
