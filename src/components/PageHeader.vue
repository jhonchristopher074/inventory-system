<template>
  <!-- scrolls away with the page (it used to stay pinned at the top).
       Anything put inside it (e.g. a Refresh button) sits on the right. -->
  <header
    class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[26px] border border-white/10 bg-zinc-900/90 p-4 shadow-lg"
  >
    <div class="min-w-0">
      <h1 class="text-2xl font-extrabold text-white">{{ title }}</h1>
      <p class="text-xs text-zinc-400">{{ subtitle }}</p>
    </div>

    <slot />
  </header>
</template>

<script setup>
defineProps({
  title: String,
  subtitle: String,
})
</script>
