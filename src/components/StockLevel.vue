<script setup>
// A product's stock in a table: "250", or in red when low ("8") and
// "0 OUT" when empty. No "LOW" word: the Low stock filter says that already.
//
//   <StockLevel :product="product" />
import { computed } from 'vue'
import { count } from '../lib/format'
import { isLowStock, isOutOfStock, stockOf } from '../lib/stock'

const props = defineProps({
  product: { type: Object, required: true },
})

const low = computed(() => isLowStock(props.product))
const out = computed(() => isOutOfStock(props.product))
</script>

<template>
  <!-- one piece, so on phones "out" stays next to the number -->
  <span :class="low ? 'text-red-400' : 'text-white'" :title="low ? (out ? 'Out of stock' : 'Running low') : ''">
    {{ count(stockOf(product)) }}
    <span v-if="out" class="ml-1 text-[0.6rem] uppercase tracking-wide">out</span>
  </span>
</template>
