<script setup>
// A small round 🔍 button over a picture that opens it full screen, without
// clicking what's under it (e.g. a POS card that adds to the cart).
//
//   <div class="relative">
//     <img ... />
//     <PreviewButton :src="product.image_url" :alt="product.name" />
//   </div>
//
// A tap anywhere, ✕ or Esc closes the big picture.
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
    class="preview-btn"
    :aria-label="`See the picture of ${props.alt || 'this product'}`"
    title="See the picture"
    @click.stop.prevent="open = true"
    @keydown.enter.stop
    @keydown.space.stop
  >
    <span class="preview-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" />
      </svg>
    </span>
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
/* the whole picture opens it; the round icon in the corner says so */
.preview-btn {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  cursor: zoom-in;
}

.preview-icon {
  position: absolute;
  right: 0.4rem;
  top: 0.4rem;
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 999px;
  background: rgba(15, 17, 20, 0.72);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  transition: transform 0.15s var(--ease), background-color 0.15s var(--ease);
}

.preview-icon svg {
  width: 1rem;
  height: 1rem;
}

.preview-btn:hover .preview-icon,
.preview-btn:focus-visible .preview-icon {
  transform: scale(1.08);
  background: var(--brand);
}

.preview-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.7);
  outline-offset: -2px;
}
</style>