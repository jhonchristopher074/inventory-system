<template>
  <div>
    <header class="mb-6 rounded-[28px] border border-white/10 bg-zinc-900 p-7 shadow-2xl">
      <h1 class="mb-2 text-4xl font-extrabold text-white">Inventory</h1>
      <p class="text-zinc-400">
        View products, check quantity, and set inspection schedules.
      </p>
    </header>

    <div class="mb-5 flex gap-3 overflow-x-auto pb-2">
      <button
        v-for="category in categories"
        :key="category"
        class="rounded-full border px-4 py-2 text-sm font-bold transition"
        :class="
          selectedCategory === category
            ? 'border-red-600 bg-red-600 text-white'
            : 'border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
        "
        @click="selectedCategory = category"
      >
        {{ category }}
      </button>
    </div>

    <h2 class="mb-4 text-3xl font-bold text-white">Product Inventory</h2>

    <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
      <div
        v-for="product in filteredProducts"
        :key="product.id"
        class="min-h-[298px] cursor-pointer rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl transition hover:-translate-y-1"
        @click="openModal(product)"
      >
        <img
          :src="product.img"
          :alt="product.name"
          class="mb-3 h-[155px] w-full rounded-2xl object-cover"
        />

        <h3 class="mb-2 text-2xl font-bold text-white">{{ product.name }}</h3>
        <p class="text-zinc-400">{{ product.category }}</p>
        <p class="mt-2 text-zinc-300">Qty: {{ product.qty }}</p>
      </div>
    </div>

    <ProductModal
      :product="selectedProduct"
      @close="selectedProduct = null"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import ProductModal from '../components/ProductModal.vue'
import { products } from '../data/products'

const selectedCategory = ref('All')
const selectedProduct = ref(null)

const categories = computed(() => [
  'All',
  ...new Set(products.map((product) => product.category)),
])

const filteredProducts = computed(() => {
  if (selectedCategory.value === 'All') return products
  return products.filter((product) => product.category === selectedCategory.value)
})

function openModal(product) {
  selectedProduct.value = product
}
</script>