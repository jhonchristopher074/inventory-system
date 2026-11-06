<template>
  <!-- The pop-up messages of lib/toast.js: top centre, above everything,
       gone after a few seconds (✕ closes one now). -->
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 top-3 z-[2400] flex flex-col items-center gap-2 px-3" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="item in toasts"
          :key="item.id"
          class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur"
          :class="item.kind === 'error'
            ? 'border-red-500/30 bg-zinc-950/95 text-red-300'
            : 'border-emerald-500/30 bg-zinc-950/95 text-emerald-200'"
          :role="item.kind === 'error' ? 'alert' : 'status'"
        >
          <span
            class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-black"
            :class="item.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-500 text-black'"
            aria-hidden="true"
          >
            {{ item.kind === 'error' ? '!' : '✓' }}
          </span>
          <p class="min-w-0 flex-1 leading-snug">{{ item.text }}</p>
          <button
            type="button"
            class="shrink-0 text-zinc-500 hover:text-white"
            aria-label="Close"
            @click="dismissToast(item.id)"
          >
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { dismissToast, toasts } from '../lib/toast'
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
