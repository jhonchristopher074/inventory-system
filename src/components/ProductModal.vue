<template>
  <div
    v-if="product"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    @click.self="close"
  >
    <div
      class="relative w-full max-w-md rounded-[26px] border border-white/10 bg-zinc-900 p-5 shadow-2xl"
    >
      <button
        class="absolute right-4 top-3 text-3xl text-white"
        @click="close"
      >
        &times;
      </button>

      <img
        :src="product.img"
        :alt="product.name"
        class="mb-4 h-56 w-full rounded-2xl object-cover"
      />

      <h2 class="mb-3 text-2xl font-bold text-white">{{ product.name }}</h2>

      <p class="mb-2 text-zinc-300">
        <span class="font-semibold">Category:</span> {{ product.category }}
      </p>

      <p class="mb-4 text-zinc-300">
        <span class="font-semibold">Quantity:</span> {{ product.qty }}
      </p>

      <div class="mb-4">
        <label class="mb-2 block text-sm font-medium text-zinc-300">
          Inspection Date
        </label>

        <div @click="dateInput?.showPicker()" class="cursor-pointer">
          <input
            ref="dateInput"
            v-model="selectedDate"
            type="date"
            class="w-full cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-4 text-white outline-none"
          />
        </div>
      </div>

      <div class="flex gap-3">
        <button
          class="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700"
          @click="saveInspectionDate"
        >
          Set Inspection Date
        </button>

        <button
          class="flex-1 rounded-xl bg-zinc-800 py-3 font-semibold text-white transition hover:bg-zinc-700"
        >
          Report Product
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps(['product'])
const emit = defineEmits(['close'])

const selectedDate = ref('')
const dateInput = ref(null)

watch(
  () => props.product,
  (newProduct) => {
    selectedDate.value = newProduct?.inspectionDate || ''
  },
  { immediate: true }
)

function close() {
  emit('close')
}

function saveInspectionDate() {
  if (!props.product || !selectedDate.value) return
  props.product.inspectionDate = selectedDate.value
  emit('close')
}
</script>