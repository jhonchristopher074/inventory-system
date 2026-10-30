<template>
  <!-- scrolls away with the page (it used to stay pinned at the top) -->
  <header class="mb-4 rounded-[26px] border border-white/10 bg-zinc-900/90 p-4 shadow-lg">
    <h1 class="text-2xl font-extrabold text-white">{{ title }}</h1>
    <p class="text-xs text-zinc-400">{{ subtitle }}</p>
  </header>
</template>

<script setup>
defineProps({
  title: String,
  subtitle: String,
})
</script>