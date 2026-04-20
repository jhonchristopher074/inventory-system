<template>
  <div>
    <header class="mb-6 rounded-[28px] border border-white/10 bg-zinc-900 p-7 shadow-2xl">
      <h1 class="mb-2 text-4xl font-extrabold text-white">Deleted Items</h1>
      <p class="text-zinc-400">
        Drag products to the box, then delete the selected items together.
      </p>
    </header>

    <div class="grid grid-cols-[1fr_320px] gap-6">
      <div>
        <h2 class="mb-4 text-3xl font-bold text-white">Products</h2>

        <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
          <div
            v-for="product in products"
            :key="product.id"
            draggable="true"
            @dragstart="startDrag(product)"
            class="rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl"
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
      </div>

      <aside>
        <div class="sticky top-5 rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-2xl">
          <div class="mb-4">
            <h2 class="text-3xl font-bold text-white">Delete Box</h2>
            <p class="text-zinc-400">Sticky selection area</p>
          </div>

          <div
            class="mb-4 flex min-h-[175px] items-center justify-center rounded-[20px] border-2 border-dashed border-red-500 bg-red-500/10 p-4 text-center"
            @dragover.prevent
            @drop="dropItem"
          >
            <div>
              <strong class="mb-1 block text-xl text-white">Drag & Drop</strong>
              <span class="text-red-200">Add product here</span>
            </div>
          </div>

          <button class="mb-4 w-full rounded-xl border border-red-500/30 bg-[#2a0d0d] py-3 font-bold text-white">
            Delete Selected
          </button>

          <h3 class="mb-3 text-2xl font-bold text-white">Selected Items</h3>

          <div v-if="selectedItems.length === 0" class="text-zinc-400">
  No selected items yet.
</div>

  <div v-else class="space-y-2">
    <div
      v-for="item in selectedItems"
      :key="item.id"
      class="bg-zinc-800 p-2 rounded-lg text-white"
    >
      {{ item.name }}
    </div>
    </div>
          </div>
        </aside>
      </div>
    </div>
</template>

<script setup>
import { ref } from 'vue'
import { products } from '../data/products'

const selectedItems = ref([])
const draggedItem = ref(null)

function startDrag(product) {
  draggedItem.value = product
}

function dropItem() {
  if (!draggedItem.value) return

  if (!selectedItems.value.includes(draggedItem.value)) {
    selectedItems.value.push(draggedItem.value)
  }

  draggedItem.value = null
}
</script>