<template>
  <!-- A dashboard tile for something that may need action now (Low stock,
       Overdue). With something in it, it turns red, shows a pulsing caution
       sign and names the first few; with nothing, it's green with a check.
       Put a line under the number in the default slot (e.g. "1 out of stock"). -->
  <RouterLink :to="to" class="kpi" :class="alert ? 'tone-red kpi-alert' : 'tone-green'">
    <div class="kpi-top">
      <p class="kpi-label">{{ label }}</p>

      <span v-if="alert" class="kpi-caution" aria-hidden="true">
        <NavIcon name="alert" class="h-4 w-4" />
      </span>
      <span v-else class="kpi-icon" aria-hidden="true">
        <NavIcon name="check" class="h-4 w-4" />
      </span>
    </div>

    <p class="kpi-value">
      {{ value == null ? '—' : count(value) }}
      <span v-if="alert" class="sr-only">, needs action</span>
    </p>
    <p class="kpi-sub">{{ sub }}</p>

    <slot />

    <!-- the first few by name; the rest is on the page the tile opens -->
    <ul v-if="items.length > 0" class="kpi-list">
      <li v-for="item in items.slice(0, shown)" :key="item.key">
        <span class="kpi-list-name">{{ item.name }}</span>
        <span class="kpi-list-tag" :class="item.tagClass">{{ item.tag }}</span>
      </li>
      <li v-if="items.length > shown" class="kpi-list-more">
        and {{ count(items.length - shown) }} more
      </li>
    </ul>
  </RouterLink>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import NavIcon from './NavIcon.vue'
import { count } from '../lib/format'

defineProps({
  to: { type: [String, Object], required: true },
  label: { type: String, required: true },
  // null while loading (shows —)
  value: { type: Number, default: null },
  sub: { type: String, default: '' },
  // red with the caution sign
  alert: { type: Boolean, default: false },
  // [{ key, name, tag, tagClass }]
  items: { type: Array, default: () => [] },
  shown: { type: Number, default: 2 },
})
</script>

<!-- the same tile styles as the dashboards themselves -->
<style scoped src="../styles/dashboard.css"></style>
