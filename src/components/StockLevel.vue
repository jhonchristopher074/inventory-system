<script setup>
// A product's stock in a table: "250", "8 LOW" or "0 OUT" (red when low).
//
//   <StockLevel :product="product" />
import { computed } from 'vue'
import { count } from '../lib/format'
import { isLowStock, isOutOfStock, stockOf } from '../lib/stock'

const props = defineProps({
  product: { type: Object, required: true },
})

const low = computed(() => isLowStock(props.product))
</script>

<template>
  <!-- one piece, so on phones "low" stays next to the number -->
  <span :class="low ? 'text-red-400' : 'text-white'">
    {{ count(stockOf(product)) }}
    <span v-if="low" class="ml-1 text-[0.6rem] uppercase tracking-wide">
      {{ isOutOfStock(product) ? 'out' : 'low' }}
    </span>
  </span>
</template>
