<template>
  <!-- A small "?" that explains something on hover, focus or tap, instead
       of a line of text on the page.
         <HelpTip text="What this does." />
       side: where the bubble opens (bottom | right | left) -->
  <span class="help" :class="`help--${side}`" @mouseleave="open = false">
    <button
      type="button"
      class="help-btn"
      :aria-label="text"
      :aria-expanded="open"
      @click.stop="open = !open"
      @mouseenter="open = true"
      @focus="open = true"
      @blur="open = false"
    >
      ?
    </button>
    <span v-if="open" class="help-tip" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  text: { type: String, required: true },
  side: { type: String, default: 'bottom' },
})

const open = ref(false)
</script>

<style scoped>
.help {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
}

.help-btn {
  display: grid;
  width: 1.05rem;
  height: 1.05rem;
  place-items: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 1;
  color: var(--color-zinc-400);
  transition: border-color 0.15s, color 0.15s;
}

.help-btn:hover,
.help-btn:focus-visible,
.help-btn[aria-expanded='true'] {
  outline: none;
  border-color: rgba(224, 27, 50, 0.6);
  color: #fff;
}

.help-tip {
  position: absolute;
  z-index: 50;
  width: max-content;
  max-width: 16rem;
  border-radius: 0.6rem;
  border: 1px solid var(--hairline);
  background: #0d0f12;
  padding: 0.5rem 0.65rem;
  font-size: 0.74rem;
  font-weight: 500;
  font-style: normal;
  letter-spacing: 0;
  text-transform: none;
  line-height: 1.4;
  color: var(--color-zinc-200);
  box-shadow: 0 10px 24px -8px rgba(0, 0, 0, 0.7);
  white-space: normal;
}

.help--bottom .help-tip {
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
}

.help--right .help-tip {
  top: 50%;
  left: calc(100% + 6px);
  transform: translateY(-50%);
}

.help--left .help-tip {
  top: 50%;
  right: calc(100% + 6px);
  transform: translateY(-50%);
}
</style>
