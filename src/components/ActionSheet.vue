<script setup>
// A list of actions for one item: slides up from the bottom on phones,
// centered on bigger screens. Used when a table row has no room for all of
// its buttons (phones, narrower windows).
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  // [{ key, label, hint?, tone?: 'danger' | 'success' }]
  actions: { type: Array, required: true },
})

const emit = defineEmits(['select', 'close'])

function toneClass(tone) {
  if (tone === 'danger') return 'bg-red-600/15 text-red-300 hover:bg-red-600/25'
  if (tone === 'success') return 'bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25'
  return 'bg-zinc-800 text-white hover:bg-zinc-700'
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        class="w-full max-w-md rounded-t-3xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate text-lg font-bold text-white">{{ title }}</h2>
            <p v-if="subtitle" class="truncate text-sm text-zinc-400">{{ subtitle }}</p>
          </div>

          <button
            type="button"
            class="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="space-y-2">
          <button
            v-for="action in actions"
            :key="action.key"
            type="button"
            class="w-full rounded-2xl px-4 py-3 text-left font-semibold transition"
            :class="toneClass(action.tone)"
            @click="emit('select', action.key)"
          >
            {{ action.label }}
            <span v-if="action.hint" class="block text-xs font-normal opacity-70">
              {{ action.hint }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
