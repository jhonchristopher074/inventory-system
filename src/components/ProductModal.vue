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
        :src="product.image_url || 'https://via.placeholder.com/300x200'"
        :alt="product.name"
        class="mb-4 h-56 w-full rounded-2xl object-cover"
      />

      <h2 class="mb-3 text-2xl font-bold text-white">{{ product.name }}</h2>

      <p class="mb-2 text-zinc-300">
        <span class="font-semibold">Category:</span> {{ product.category }}
      </p>

      <p class="mb-4 text-zinc-300">
        <span class="font-semibold">Quantity:</span> {{ product.quantity }}
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

      <p v-if="successMessage" class="mb-3 rounded-xl bg-emerald-600/20 p-3 text-sm text-emerald-400">
        {{ successMessage }}
      </p>

      <p v-if="errorMessage" class="mb-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400">
        {{ errorMessage }}
      </p>

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
import { supabase } from '../lib/supabase'

const props = defineProps(['product'])
const emit = defineEmits(['close', 'updated'])

const selectedDate = ref('')
const dateInput = ref(null)
const errorMessage = ref('')
const successMessage = ref('')

watch(
  () => props.product,
  (newProduct) => {
    selectedDate.value = newProduct?.inspection_date || ''
    errorMessage.value = ''
    successMessage.value = ''
  },
  { immediate: true }
)

function close() {
  emit('close')
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

async function saveInspectionDate() {
  if (!props.product || !selectedDate.value) {
    errorMessage.value = 'Please select an inspection date.'
    return
  }

  errorMessage.value = ''
  successMessage.value = ''

  const { error: updateError } = await supabase
    .from('products')
    .update({
      inspection_date: selectedDate.value,
      inspection_result: null,
      approved_count: 0,
      return_count: 0,
    })
    .eq('id', props.product.id)

  if (updateError) {
    errorMessage.value = updateError.message
    return
  }

  const { error: notifError } = await supabase
    .from('notifications')
    .insert({
      title: 'Inspection Scheduled',
      message: `${props.product.name} is scheduled for inspection on ${formatDate(selectedDate.value)}.`,
      type: 'inspection',
      product_id: props.product.id,
    })

  if (notifError) {
    errorMessage.value = notifError.message
    return
  }

  successMessage.value = 'Inspection date saved and notification created.'

  emit('updated')

  setTimeout(() => {
    emit('close')
  }, 700)
}
</script>