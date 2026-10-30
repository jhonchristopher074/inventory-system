<template>
  <div>
    <PageHeader title="Point of Sale" subtitle="Cashier product sales and stock-out system." />

    <!-- pb-24 on phones: room for the cart bar fixed at the bottom -->
    <div class="grid gap-6 pb-24 lg:grid-cols-[1fr_380px] lg:pb-0">
      <!-- PRODUCTS (a new page scrolls back up to the search box) -->
      <div ref="productsTop" class="scroll-mt-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search product..."
          class="mb-5 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-red-600"
        />

        <p v-if="loading" class="text-zinc-400">Loading products...</p>

        <!-- up to 4 a row: the columns follow the width of this area (it
             shares the screen with the cart), not the whole window -->
        <div class="@container">
          <div class="grid grid-cols-1 gap-4 @min-[440px]:grid-cols-2 @min-[640px]:grid-cols-3 @min-[780px]:grid-cols-4">
            <div
              v-for="product in visibleProducts"
              :key="product.id"
              class="card flex flex-col p-4"
            >
              <img
                :src="product.image_url || 'https://via.placeholder.com/300x200'"
                :alt="product.name"
                class="mb-3 h-[140px] w-full shrink-0 rounded-2xl object-cover"
                loading="lazy"
              />

              <h2 class="line-clamp-2 text-lg font-bold leading-snug text-white">
                {{ product.name }}
              </h2>
              <p class="truncate text-sm text-zinc-400">
                {{ product.category || 'Uncategorized' }}
              </p>

              <!-- mt-auto pins stock, price and the button to the bottom, so they
                   line up across the row no matter how long the product name is -->
              <div class="mt-auto pt-3">
                <p class="text-sm text-zinc-300">Stock: {{ count(product.quantity) }}</p>
                <p class="text-sm font-bold text-red-400">
                  {{ peso(product.price || 0) }}
                </p>
              </div>

              <button
                class="mt-3 w-full shrink-0 rounded-xl bg-red-600 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50"
                :disabled="product.quantity <= 0 || checkingOut"
                @click="addToCart(product)"
              >
                {{ product.quantity <= 0 ? 'Out of Stock' : 'Add to Cart' }}
              </button>
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

      <!-- CART: beside the products on wide screens. On phones it opens from
           the cart bar at the bottom instead of sitting below every product. -->
      <div
        class="card p-5 lg:sticky lg:top-5 lg:h-fit"
        :class="showCart
          ? 'max-lg:fixed max-lg:bottom-0 max-lg:right-0 max-lg:left-[var(--side)] max-lg:z-50 max-lg:max-h-[85vh] max-lg:overflow-y-auto max-lg:rounded-b-none'
          : 'max-lg:hidden'"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-2xl font-bold text-white">Cart</h2>

          <button
            type="button"
            class="rounded-full bg-zinc-800 px-3 py-1 text-white hover:bg-zinc-700 lg:hidden"
            aria-label="Close cart"
            @click="showCart = false"
          >
            ✕
          </button>
        </div>

        <p v-if="cart.length === 0" class="text-zinc-500">No items in cart.</p>

        <div class="space-y-3">
          <div v-for="item in cart" :key="item.id" class="rounded-2xl bg-black p-4">
            <div class="flex justify-between gap-3">
              <div>
                <h3 class="font-bold text-white">{{ item.name }}</h3>
                <p class="text-sm text-zinc-400">{{ peso(item.price) }}</p>
              </div>

              <button class="text-sm font-bold text-red-400" @click="removeFromCart(item.id)">
                Remove
              </button>
            </div>

            <div class="mt-3 flex items-center gap-2">
              <button class="qty-btn" :disabled="checkingOut" @click="decreaseQty(item.id)">-</button>

              <input
                v-model.number="item.cartQty"
                type="number"
                min="1"
                step="1"
                :max="item.quantity"
                class="w-16 rounded-lg bg-zinc-800 py-1 text-center text-white disabled:opacity-50"
                :disabled="checkingOut"
                @change="validateQty(item)"
              />

              <button class="qty-btn" :disabled="checkingOut" @click="increaseQty(item.id)">+</button>
            </div>

            <p class="mt-2 text-sm text-zinc-300">
              Subtotal:
              <span class="font-bold text-white">
                {{ peso(item.price * item.cartQty) }}
              </span>
            </p>
          </div>
        </div>

        <div class="mt-5 border-t border-white/10 pt-4">
          <div class="mb-4 flex justify-between text-xl font-bold">
            <span>Total</span>
            <span class="text-red-400">{{ peso(totalAmount) }}</span>
          </div>

          <p v-if="errorMessage" class="mb-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400">
            {{ errorMessage }}
          </p>

          <p v-if="successMessage" class="mb-3 rounded-xl bg-emerald-600/20 p-3 text-sm text-emerald-400">
            {{ successMessage }}
          </p>

          <button
            class="w-full rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="cart.length === 0 || checkingOut"
            @click="checkout"
          >
            {{ checkingOut ? 'Processing...' : 'Checkout' }}
          </button>

          <button class="mt-3 w-full rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700" @click="clearCart">
            Clear Cart
          </button>
        </div>
      </div>
    </div>

    <!-- PHONES: the cart is always one tap away -->
    <div
      v-if="showCart"
      class="fixed inset-0 z-40 bg-black/60 lg:hidden"
      @click="showCart = false"
    ></div>

    <button
      v-else
      type="button"
      class="fixed bottom-3 right-3 left-[calc(var(--side)_+_0.75rem)] z-40 flex items-center justify-between gap-3 rounded-2xl bg-red-600 px-5 py-4 font-bold text-white shadow-2xl hover:bg-red-700 lg:hidden"
      @click="showCart = true"
    >
      <span>🛒 Cart · {{ cartCount }} item(s)</span>
      <span>{{ peso(totalAmount) }}</span>
    </button>

    <div v-if="receipt" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div class="max-h-[92vh] w-full max-w-md overflow-y-auto card p-5 shadow-2xl">
        <div id="receiptArea" class="rounded-2xl bg-white p-5 text-black">
          <div class="text-center">
            <h2 class="text-2xl font-extrabold">10 FIVE 7 Hardware</h2>
            <p class="text-sm">Inventory Management System</p>
            <p class="mt-2 text-xs">Official Sales Receipt</p>
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
              <p class="text-xs">
                Qty: {{ count(item.quantity) }} × {{ peso(item.price) }}
              </p>
            </div>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>{{ peso(receipt.total_amount) }}</span>
          </div>

          <p class="mt-5 text-center text-xs">Thank you for your purchase!</p>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
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
import { supabase } from '../../lib/supabase'
import { GRID_PAGE_SIZES, usePagination } from '../../lib/usePagination'
import { printElement } from '../../lib/printReceipt'
import { count, peso } from '../../lib/format'
import TablePager from '../../components/TablePager.vue'
import PageHeader from '../../components/PageHeader.vue'

const products = ref([])
const cart = ref([])
const searchQuery = ref('')
const loading = ref(false)
// While a sale is being processed the cart is locked: changes made in that
// moment were wiped when the sale finished, without being sold.
const checkingOut = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const receipt = ref(null)

// phones: the cart opens as a sheet from the bar at the bottom of the screen
const showCart = ref(false)
const cartCount = computed(() =>
  cart.value.reduce((sum, item) => sum + Number(item.cartQty || 0), 0)
)

const currentCashier = ref({
  id: '',
  full_name: '',
  email: '',
})

// The cashier's name on the receipt, as the sale saved it (the account's
// name; the sale falls back to the email when no name is set, so then
// just "Cashier").
const receiptCashier = computed(() => {
  const name = String(receipt.value?.cashier_name || '').trim()
  return name && !name.includes('@') ? name : 'Cashier'
})

const filteredProducts = computed(() => {
  const search = searchQuery.value.toLowerCase().trim()
  if (!search) return products.value

  return products.value.filter(product =>
    product.name?.toLowerCase().includes(search) ||
    product.category?.toLowerCase().includes(search)
  )
})

// 16 or 24 products a page (4 full rows of 4), or all of them. The choice
// is remembered on this device.
const productsTop = ref(null)
const {
  page,
  pageSize,
  visible: visibleProducts,
  reset: resetPage,
} = usePagination(filteredProducts, {
  storageKey: 'pos',
  scrollTarget: productsTop,
  sizes: GRID_PAGE_SIZES,
})

// a new search starts again at page 1
watch(searchQuery, resetPage)

const totalAmount = computed(() => {
  return cart.value.reduce((total, item) => {
    return total + Number(item.price || 0) * Number(item.cartQty || 0)
  }, 0)
})

async function fetchCurrentCashier() {
  const savedUser = JSON.parse(localStorage.getItem('currentUser') || 'null')

  if (!savedUser) {
    errorMessage.value = 'No cashier account detected. Please login again.'
    return
  }

  currentCashier.value = {
    id: savedUser.id,
    full_name: savedUser.full_name || 'Cashier',
    email: savedUser.email || '',
  }
}

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'active',
    p_order_by: 'id_desc',
  })

  if (error) {
    errorMessage.value = error.message
    products.value = []
  } else {
    products.value = data || []
  }

  loading.value = false
}

function addToCart(product) {
  if (checkingOut.value) return // cart locked while the sale is processed

  errorMessage.value = ''
  successMessage.value = ''

  if (product.quantity <= 0) {
    errorMessage.value = 'This product is out of stock.'
    return
  }

  const existing = cart.value.find(item => item.id === product.id)

  if (existing) {
    if (existing.cartQty >= product.quantity) {
      errorMessage.value = 'Cannot add more than available stock.'
      return
    }

    existing.cartQty += 1
    return
  }

  cart.value.push({
    ...product,
    price: Number(product.price || 0),
    cartQty: 1,
  })
}

function removeFromCart(productId) {
  if (checkingOut.value) return // cart locked while the sale is processed

  cart.value = cart.value.filter(item => item.id !== productId)
}

function increaseQty(productId) {
  if (checkingOut.value) return // cart locked while the sale is processed

  const item = cart.value.find(item => item.id === productId)
  if (!item) return

  if (item.cartQty >= item.quantity) {
    errorMessage.value = 'Cannot exceed available stock.'
    return
  }

  item.cartQty += 1
}

function decreaseQty(productId) {
  if (checkingOut.value) return // cart locked while the sale is processed

  const item = cart.value.find(item => item.id === productId)
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
    errorMessage.value = 'Quantity adjusted to available stock.'
  }
}

function clearCart() {
  if (checkingOut.value) return // cart locked while the sale is processed

  cart.value = []
  errorMessage.value = ''
  successMessage.value = ''
}

async function checkout() {
  if (cart.value.length === 0) return

  checkingOut.value = true
  errorMessage.value = ''
  successMessage.value = ''

  await fetchCurrentCashier()

  if (!currentCashier.value.id) {
    errorMessage.value = 'No cashier account detected.'
    checkingOut.value = false
    return
  }

  const { data: sale, error: saleError } = await supabase.rpc('process_sale', {
    p_cashier_id: currentCashier.value.id,
    p_cashier_name: currentCashier.value.full_name,
    p_cashier_email: currentCashier.value.email,
    p_items: cart.value.map(item => ({
      product_id: item.id,
      quantity: item.cartQty,
    })),
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

  successMessage.value = 'Sale completed successfully.'
  showCart.value = false // the receipt shows next
  cart.value = []

  await fetchProducts()
  checkingOut.value = false
}

function formatDate(date) {
  return new Date(date).toLocaleString()
}

function printReceipt() {
  printElement('receiptArea')
}

onMounted(async () => {
  await fetchCurrentCashier()
  await fetchProducts()
})
</script>

<style scoped>
.qty-btn {
  border-radius: 0.5rem;
  background: rgb(39 39 42);
  padding: 0.25rem 0.75rem;
  font-weight: 700;
  color: white;
}

.qty-btn:hover {
  background: rgb(63 63 70);
}

.qty-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>