<template>
  <div>
    <div class="mb-6 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <h1 class="text-3xl font-bold text-white">Point of Sale</h1>
      <p class="text-zinc-400">Cashier product sales and stock-out system.</p>
    </div>

    <div class="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search product..."
          class="mb-5 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-red-600"
        />

        <p v-if="loading" class="text-zinc-400">Loading products...</p>

        <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
          <div
            v-for="product in filteredProducts"
            :key="product.id"
            class="rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl"
          >
            <img
              :src="product.image_url || 'https://via.placeholder.com/300x200'"
              class="mb-3 h-[140px] w-full rounded-2xl object-cover"
            />

            <h2 class="text-xl font-bold text-white">{{ product.name }}</h2>
            <p class="text-sm text-zinc-400">{{ product.category || 'Uncategorized' }}</p>

            <div class="mt-3 space-y-1 text-sm">
              <p class="text-zinc-300">Stock: {{ product.quantity }}</p>
              <p class="font-bold text-red-400">
                ₱{{ Number(product.price || 0).toFixed(2) }}
              </p>
            </div>

            <button
              class="mt-4 w-full rounded-xl bg-red-600 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="product.quantity <= 0"
              @click="addToCart(product)"
            >
              {{ product.quantity <= 0 ? 'Out of Stock' : 'Add to Cart' }}
            </button>
          </div>
        </div>
      </div>

      <div class="sticky top-5 h-fit rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <h2 class="mb-4 text-2xl font-bold text-white">Cart</h2>

        <p v-if="cart.length === 0" class="text-zinc-500">No items in cart.</p>

        <div class="space-y-3">
          <div v-for="item in cart" :key="item.id" class="rounded-2xl bg-black p-4">
            <div class="flex justify-between gap-3">
              <div>
                <h3 class="font-bold text-white">{{ item.name }}</h3>
                <p class="text-sm text-zinc-400">₱{{ item.price.toFixed(2) }}</p>
              </div>

              <button class="text-sm font-bold text-red-400" @click="removeFromCart(item.id)">
                Remove
              </button>
            </div>

            <div class="mt-3 flex items-center gap-2">
              <button class="qty-btn" @click="decreaseQty(item.id)">-</button>

              <input
                v-model.number="item.cartQty"
                type="number"
                min="1"
                :max="item.quantity"
                class="w-16 rounded-lg bg-zinc-800 py-1 text-center text-white"
                @change="validateQty(item)"
              />

              <button class="qty-btn" @click="increaseQty(item.id)">+</button>
            </div>

            <p class="mt-2 text-sm text-zinc-300">
              Subtotal:
              <span class="font-bold text-white">
                ₱{{ (item.price * item.cartQty).toFixed(2) }}
              </span>
            </p>
          </div>
        </div>

        <div class="mt-5 border-t border-white/10 pt-4">
          <div class="mb-4 flex justify-between text-xl font-bold">
            <span>Total</span>
            <span class="text-red-400">₱{{ totalAmount.toFixed(2) }}</span>
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

    <div v-if="receipt" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div class="w-full max-w-md rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-2xl">
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
            <p><strong>Cashier:</strong> {{ receipt.cashier_name }}</p>
            <p><strong>Email:</strong> {{ receipt.cashier_email }}</p>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="space-y-3">
            <div v-for="item in receipt.items" :key="item.product_id" class="text-sm">
              <div class="flex justify-between gap-3">
                <p class="font-bold">{{ item.product_name }}</p>
                <p>₱{{ Number(item.subtotal).toFixed(2) }}</p>
              </div>
              <p class="text-xs">
                Qty: {{ item.quantity }} × ₱{{ Number(item.price).toFixed(2) }}
              </p>
            </div>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>₱{{ Number(receipt.total_amount).toFixed(2) }}</span>
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
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'

const products = ref([])
const cart = ref([])
const searchQuery = ref('')
const loading = ref(false)
const checkingOut = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const receipt = ref(null)

const currentCashier = ref({
  id: '',
  full_name: '',
  email: '',
})

const filteredProducts = computed(() => {
  const search = searchQuery.value.toLowerCase().trim()
  if (!search) return products.value

  return products.value.filter(product =>
    product.name?.toLowerCase().includes(search) ||
    product.category?.toLowerCase().includes(search)
  )
})

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

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .order('id', { ascending: false })

  if (error) {
    errorMessage.value = error.message
    products.value = []
  } else {
    products.value = data || []
  }

  loading.value = false
}

function addToCart(product) {
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
  cart.value = cart.value.filter(item => item.id !== productId)
}

function increaseQty(productId) {
  const item = cart.value.find(item => item.id === productId)
  if (!item) return

  if (item.cartQty >= item.quantity) {
    errorMessage.value = 'Cannot exceed available stock.'
    return
  }

  item.cartQty += 1
}

function decreaseQty(productId) {
  const item = cart.value.find(item => item.id === productId)
  if (!item) return

  if (item.cartQty <= 1) {
    removeFromCart(productId)
    return
  }

  item.cartQty -= 1
}

function validateQty(item) {
  if (item.cartQty < 1) item.cartQty = 1

  if (item.cartQty > item.quantity) {
    item.cartQty = item.quantity
    errorMessage.value = 'Quantity adjusted to available stock.'
  }
}

function clearCart() {
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

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      cashier_id: currentCashier.value.id,
      cashier_name: currentCashier.value.full_name,
      cashier_email: currentCashier.value.email,
      total_amount: totalAmount.value,
    })
    .select()
    .single()

  if (saleError) {
    errorMessage.value = saleError.message
    checkingOut.value = false
    return
  }

  const saleItems = cart.value.map(item => ({
    sale_id: sale.id,
    product_id: item.id,
    product_name: item.name,
    quantity: item.cartQty,
    price: item.price,
    subtotal: item.price * item.cartQty,
  }))

  const { error: itemsError } = await supabase
    .from('sale_items')
    .insert(saleItems)

  if (itemsError) {
    errorMessage.value = itemsError.message
    checkingOut.value = false
    return
  }

  for (const item of cart.value) {
    const newQuantity = Number(item.quantity) - Number(item.cartQty)

    const { error: updateError } = await supabase
      .from('products')
      .update({ quantity: newQuantity })
      .eq('id', item.id)

    if (updateError) {
      errorMessage.value = updateError.message
      checkingOut.value = false
      return
    }
  }

  await supabase.from('notifications').insert({
    title: 'New Sale Completed',
    message: `${currentCashier.value.full_name} completed sale #${sale.id} worth ₱${totalAmount.value.toFixed(2)}.`,
    type: 'sale',
    is_read: false,
  })

  receipt.value = {
    ...sale,
    cashier_name: currentCashier.value.full_name,
    cashier_email: currentCashier.value.email,
    items: saleItems,
  }

  successMessage.value = 'Sale completed successfully.'
  cart.value = []

  await fetchProducts()
  checkingOut.value = false
}

function formatDate(date) {
  return new Date(date).toLocaleString()
}

function printReceipt() {
  const receiptContent = document.getElementById('receiptArea').innerHTML
  const printWindow = window.open('', '', 'width=400,height=600')

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .font-extrabold { font-weight: 800; }
          .text-2xl { font-size: 24px; }
          .text-lg { font-size: 18px; }
          .text-sm { font-size: 14px; }
          .text-xs { font-size: 12px; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .gap-3 { gap: 12px; }
          .my-4 { margin-top: 16px; margin-bottom: 16px; }
          .mt-2 { margin-top: 8px; }
          .mt-5 { margin-top: 20px; }
          .space-y-3 > * + * { margin-top: 12px; }
          .border-t { border-top: 1px dashed #000; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>${receiptContent}</body>
    </html>
  `)

  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
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
</style>