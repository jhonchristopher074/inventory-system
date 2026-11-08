<template>
  <!-- The Point of Sale, for the Owner (owner: refunds at once, can enable a
       disabled product) and the Cashier. Products on the left, the current
       sale on the right (on phones: a sheet from the bar at the bottom).
       Tap a product to add it. -->
  <div>
    <PageHeader title="Point of Sale" :subtitle="owner ? 'Sell, refund and keep the shelf in check.' : 'Sell and print receipts.'">
      <button
        type="button"
        class="refund-btn"
        title="A customer returned a product: refund it"
        @click="refundOpen = true"
      >
        <NavIcon name="restore" class="h-4 w-4" /> Refund
      </button>
    </PageHeader>

    <RefundRequestModal v-if="refundOpen" :owner="owner" @close="refundOpen = false" @sent="refundSent" />

    <!-- pb-24 on phones: room for the cart bar fixed at the bottom -->
    <div class="grid gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-0">
      <!-- PRODUCTS (a new page scrolls back up to the search box) -->
      <section ref="productsTop" class="min-w-0 scroll-mt-4" aria-label="Products">
        <!-- search: "/" jumps here; Enter adds the only match -->
        <div class="search-box mb-3">
          <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" stroke-linecap="round" />
          </svg>
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="search"
            maxlength="80"
            placeholder="Search products…"
            aria-label="Search products"
            class="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-zinc-500"
            @keydown.enter.prevent="addOnlyMatch"
          />
          <kbd class="desktop-only hidden-touch" title="Press / to search">/</kbd>
        </div>

        <!-- categories: only the ones that have products, with how many -->
        <div v-if="categoryTabs.length > 2" class="category-row -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-2" role="group" aria-label="Category">
          <button
            v-for="tab in categoryTabs"
            :key="tab.name"
            type="button"
            class="cat-chip"
            :class="{ 'is-on': selectedCategory === tab.name }"
            :aria-pressed="selectedCategory === tab.name"
            @click="selectedCategory = tab.name"
          >
            {{ tab.name }}
            <span>{{ count(tab.count) }}</span>
          </button>
        </div>

        <!-- what Disable / Enable / a refund just did -->
        <p v-if="posNotice" class="mb-4 rounded-xl p-3 text-sm" :class="posNotice.ok ? 'bg-emerald-600/15 text-emerald-300' : 'bg-red-600/15 text-red-400'" role="status">
          {{ posNotice.text }}
        </p>

        <p v-if="loading && products.length === 0" class="card p-6 text-center text-zinc-400">Loading products…</p>

        <!-- 2 a row on phones, up to 4: the columns follow this area's width -->
        <div class="@container">
          <div class="grid grid-cols-2 gap-3 @min-[560px]:grid-cols-3 @min-[820px]:grid-cols-4">
            <article
              v-for="product in visibleProducts"
              :key="product.id"
              class="tile"
              :class="{
                'is-off': infoFor(product) || stockOf(product) <= 0,
                'in-cart': inCart(product.id) > 0,
              }"
            >
              <!-- the whole picture + name adds it -->
              <button
                type="button"
                class="tile-main"
                :disabled="!canSell(product) || checkingOut"
                :aria-label="`Add ${product.name} to the sale`"
                @click="addToCart(product)"
              >
                <div class="tile-media">
                  <img
                    v-if="product.image_url"
                    :src="product.image_url"
                    :alt="product.name"
                    loading="lazy"
                  />
                  <span v-else class="tile-noimg" aria-hidden="true">
                    <NavIcon name="inventory" class="h-8 w-8" />
                  </span>

                  <span v-if="infoFor(product)" class="tile-flag is-red">Disabled</span>
                  <span v-else-if="stockOf(product) <= 0" class="tile-flag is-red">Out of stock</span>

                  <!-- how many are in the sale already -->
                  <span v-if="inCart(product.id) > 0" class="tile-qty">{{ count(inCart(product.id)) }}</span>
                </div>

                <div class="tile-body">
                  <h2 class="tile-name">{{ product.name }}</h2>
                  <div class="mt-auto flex items-end justify-between gap-2 pt-2">
                    <p class="tile-price">{{ peso(product.price || 0) }}</p>
                    <p class="tile-stock" :class="stockTone(product)">
                      {{ stockOf(product) <= 0 ? 'None' : `${count(stockOf(product))} left` }}
                    </p>
                  </div>
                </div>
              </button>

              <PreviewButton v-if="product.image_url" :src="product.image_url" :alt="product.name" />

              <!-- disabled: the reason; the Owner can enable it -->
              <div v-if="infoFor(product)" class="tile-foot">
                <p class="line-clamp-2 text-xs font-semibold text-red-300" :title="infoFor(product).reason">
                  {{ infoFor(product).reason }}
                </p>
                <button
                  v-if="owner"
                  type="button"
                  class="mt-2 w-full rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  :disabled="enablingId === product.id"
                  @click="enableProduct(product)"
                >
                  {{ enablingId === product.id ? 'Enabling…' : 'Enable' }}
                </button>
              </div>

              <!-- damaged, expired, wrong price…: take it off sale and tell the owner -->
              <button
                v-else
                type="button"
                class="tile-disable"
                title="Damaged, expired, wrong price…: take it off sale"
                @click="askDisable(product)"
              >
                Disable
              </button>
            </article>
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

        <div v-else-if="!loading" class="card p-8 text-center">
          <p class="font-bold text-white">{{ products.length > 0 ? 'No product matches' : 'No products to sell' }}</p>
          <p class="mt-1 text-sm text-zinc-500">
            {{ products.length > 0 ? 'Try another name or category.' : 'Products added in Inventory show up here.' }}
          </p>
        </div>
      </section>

      <!-- CURRENT SALE: beside the products on wide screens; on phones a sheet -->
      <aside
        class="sale-panel"
        :class="showCart ? 'is-open' : 'max-lg:hidden'"
        aria-label="Current sale"
      >
        <header class="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <h2 class="text-lg font-extrabold text-white">Current sale</h2>
            <p class="text-xs text-zinc-500">{{ cartCount ? `${count(cartCount)} item${cartCount === 1 ? '' : 's'}` : 'Tap a product to add it' }}</p>
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
              <p class="text-xs text-zinc-500">Products you tap show up here.</p>
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

    <!-- SALE DONE: the receipt -->
    <div
      v-if="receipt"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-done-title"
    >
      <div class="flex max-h-[92vh] w-full max-w-md flex-col rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <div class="mb-4 flex items-center gap-3">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <NavIcon name="check" class="h-6 w-6" />
          </span>
          <div class="min-w-0">
            <h2 id="sale-done-title" class="text-lg font-extrabold text-white">Sale complete</h2>
            <p class="text-xs text-zinc-400">Sale #{{ receipt.id }} · {{ peso(receipt.total_amount) }}</p>
          </div>
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
                  <p class="shrink-0">{{ peso(item.subtotal) }}</p>
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

        <div class="mt-4 grid grid-cols-2 gap-3">
          <button class="rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700" @click="newSale">
            New sale
          </button>
          <button class="rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700" @click="printReceipt">
            Print receipt
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { heldProductIds, withoutHeld } from '../lib/heldProducts'
import { GRID_PAGE_SIZES, usePagination } from '../lib/usePagination'
import { printElement } from '../lib/printReceipt'
import { count, peso } from '../lib/format'
import { NO_CATEGORY } from '../lib/categories'
import { isLowStock, stockOf } from '../lib/stock'
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
const searchInput = ref(null)
const loading = ref(false)
// While a sale is being processed the cart is locked: changes made in that
// moment were wiped when the sale finished, without being sold.
const checkingOut = ref(false)

const errorMessage = ref('')
const receipt = ref(null)

// phones: the sale opens as a sheet from the bar at the bottom of the screen
const showCart = ref(false)
const cartCount = computed(() => cart.value.reduce((sum, item) => sum + Number(item.cartQty || 0), 0))

// how many of a product are in the sale
function inCart(id) {
  return cart.value.find((item) => item.id === id)?.cartQty || 0
}

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

function canSell(product) {
  return !infoFor(product) && stockOf(product) > 0
}

function stockTone(product) {
  if (stockOf(product) <= 0) return 'is-red'
  return isLowStock(product) ? 'is-amber' : ''
}

/* ---- "/" jumps to the search; Enter there adds the only match ---- */
function onKey(event) {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  event.preventDefault()
  searchInput.value?.focus()
}

function addOnlyMatch() {
  const sellable = filteredProducts.value.filter(canSell)
  if (searchQuery.value.trim() && sellable.length === 1) {
    addToCart(sellable[0])
    searchQuery.value = ''
  }
}

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

function newSale() {
  receipt.value = null
  searchInput.value?.focus()
}

function formatDate(date) {
  return new Date(date).toLocaleString()
}

function printReceipt() {
  printElement('receiptArea')
}

onMounted(() => {
  fetchProducts()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.refund-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(245, 158, 11, 0.4);
  padding: 0.5rem 0.9rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #fcd34d;
  transition: background-color 0.15s;
}

.refund-btn:hover {
  background: rgba(245, 158, 11, 0.12);
  color: #fff;
}

/* the search bar */
.search-box {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 1rem;
  border: 1px solid var(--hairline);
  background: var(--surface);
  padding: 0.75rem 1rem;
}

.search-box:focus-within {
  border-color: rgba(224, 27, 50, 0.55);
  box-shadow: 0 0 0 3px rgba(224, 27, 50, 0.14);
}

.search-box kbd {
  border-radius: 0.4rem;
  border: 1px solid var(--hairline);
  padding: 0 0.4rem;
  font-size: 0.75rem;
  color: var(--color-zinc-500);
}

@media (hover: none) {
  .hidden-touch {
    display: none;
  }
}

/* the category buttons: one row, scrolled sideways */
.category-row {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  scroll-snap-type: x proximity;
}

.cat-chip {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.4rem;
  scroll-snap-align: start;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid var(--hairline);
  background: var(--surface);
  padding: 0.45rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-zinc-300);
  transition: background-color 0.15s, color 0.15s;
}

.cat-chip span {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-zinc-500);
}

.cat-chip:hover {
  color: #fff;
}

.cat-chip.is-on {
  border-color: transparent;
  background: var(--brand);
  color: #fff;
}

.cat-chip.is-on span {
  color: rgba(255, 255, 255, 0.8);
}

/* a product tile */
.tile {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.1rem;
  border: 1px solid var(--hairline);
  background: var(--surface);
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}

.tile:hover:not(.is-off) {
  border-color: rgba(224, 27, 50, 0.45);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.6);
}

.tile.in-cart {
  border-color: rgba(224, 27, 50, 0.6);
}

.tile-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  text-align: left;
}

.tile-main:focus-visible {
  outline: 2px solid rgba(224, 27, 50, 0.7);
  outline-offset: -2px;
}

.tile-main:disabled {
  cursor: not-allowed;
}

.tile-media {
  position: relative;
  aspect-ratio: 4 / 3;
  background: rgba(0, 0, 0, 0.35);
}

.tile-media img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}

.tile.is-off .tile-media img {
  opacity: 0.4;
  filter: grayscale(1);
}

.tile-noimg {
  display: grid;
  height: 100%;
  place-items: center;
  color: var(--color-zinc-600, #52525b);
}

.tile-flag {
  position: absolute;
  left: 0.5rem;
  top: 0.5rem;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #fff;
}

.tile-flag.is-red {
  background: var(--brand);
}

/* how many are in the sale */
.tile-qty {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: grid;
  min-width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border-radius: 999px;
  background: var(--brand);
  padding: 0 0.45rem;
  font-size: 0.8rem;
  font-weight: 800;
  color: #fff;
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.6);
}

.tile-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0.65rem 0.75rem 0.5rem;
}

.tile-name {
  display: -webkit-box;
  min-height: 2.6em;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.3;
  color: #fff;
}

.tile-price {
  font-size: 1rem;
  font-weight: 800;
  color: #fff;
}

.tile-stock {
  white-space: nowrap;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-zinc-500);
}

.tile-stock.is-amber {
  color: #fcd34d;
}

.tile-stock.is-red {
  color: #fca5a5;
}

.tile-foot {
  padding: 0 0.75rem 0.75rem;
}

/* small "Disable" link at the bottom of a tile */
.tile-disable {
  margin: 0 0.75rem 0.6rem;
  align-self: flex-start;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-zinc-500);
}

.tile-disable:hover {
  color: #fca5a5;
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
