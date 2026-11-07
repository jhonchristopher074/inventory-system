<script setup>
// A product's small picture in a list that opens big when clicked / tapped.
//
//   <ZoomThumb :src="product.image_url" :alt="product.name" />
//
// The big picture covers the screen; a tap anywhere, ✕ or Esc closes it.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
})

const open = ref(false)
const closeButton = ref(null)

function onKey(event) {
  if (event.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener('keydown', onKey)
    nextTick(() => closeButton.value?.focus())
  } else {
    window.removeEventListener('keydown', onKey)
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <button
    type="button"
    class="zoom-thumb list-thumb"
    :aria-label="`See the picture of ${props.alt || 'this product'}`"
    :title="'See the picture'"
    @click.stop="open = true"
  >
    <img :src="src" :alt="alt" loading="lazy" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="alt || 'Picture'"
      @click="open = false"
    >
      <button
        ref="closeButton"
        type="button"
        class="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
        aria-label="Close"
        @click.stop="open = false"
      >
        ✕
      </button>
      <figure class="flex max-h-full flex-col items-center gap-3" @click.stop>
        <img :src="src" :alt="alt" class="max-h-[82vh] max-w-[94vw] rounded-2xl object-contain shadow-2xl" />
        <figcaption v-if="alt" class="max-w-[90vw] truncate text-center text-sm font-bold text-white">{{ alt }}</figcaption>
      </figure>
    </div>
  </Teleport>
</template>

<style scoped>
.zoom-thumb {
  padding: 0;
  overflow: hidden;
  cursor: zoom-in;
  transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease);
}

.zoom-thumb:hover,
.zoom-thumb:focus-visible {
  outline: none;
  transform: scale(1.06);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
}

.zoom-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
