<template>
  <!-- A dashboard tile for something that may need action now (Low stock,
       Overdue). With something in it, it turns warning yellow (dark text,
       a big faint warning sign, "See the list"); with nothing, it's green
       with a check. The page it opens has the list. Put a line under the
       number in the default slot (e.g. "1 out of stock"). -->
  <RouterLink :to="to" class="kpi" :class="alert ? 'kpi-alert' : 'tone-green'">
    <!-- the big faint sign behind the numbers -->
    <NavIcon v-if="alert" name="alert" class="kpi-bg-icon" aria-hidden="true" />

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

    <p v-if="alert" class="kpi-more">
      See the list <NavIcon name="chevron" class="h-3.5 w-3.5" />
    </p>
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
  // warning yellow with the caution sign
  alert: { type: Boolean, default: false },
})
</script>

<!-- the same tile styles as the dashboards themselves -->
<style scoped src="../styles/dashboard.css"></style>
