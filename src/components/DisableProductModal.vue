<template>
  <!-- "Disable this product?" with the reason (one tap, or typed). The
       product can't be sold until the owner enables it, and the owner is
       told. -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disable-title"
      @click.self="!busy && emit('cancel')"
      @keydown.esc="!busy && emit('cancel')"
    >
      <form
        class="w-full max-w-md rounded-[24px] border border-red-500/30 bg-zinc-900 p-6 shadow-2xl"
        @submit.prevent="submit"
      >
        <div class="flex items-start gap-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-600 text-white" aria-hidden="true">
            <NavIcon name="alert" class="h-5 w-5" />
          </span>
          <div class="min-w-0">
            <h2 id="disable-title" class="text-xl font-bold text-white">Disable this product?</h2>
            <p class="mt-1 truncate text-sm font-bold text-zinc-200">{{ product.name }}</p>
          </div>
        </div>

        <p class="mt-4 text-sm leading-relaxed text-zinc-400">
          It can't be sold until the owner enables it again. The owner is notified.
        </p>

        <p class="mt-5 text-sm font-bold text-zinc-200">Why?</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            v-for="option in DISABLE_REASONS"
            :key="option"
            type="button"
            class="rounded-full border px-3 py-1.5 text-xs font-bold transition"
            :class="reason === option
              ? 'border-red-500 bg-red-600 text-white'
              : 'border-white/10 bg-zinc-800 text-zinc-300 hover:border-red-500/50 hover:text-white'"
            @click="reason = option"
          >
            {{ option }}
          </button>
        </div>

        <label class="mt-3 block text-xs text-zinc-500" for="disable-reason">Or type the reason</label>
        <input
          id="disable-reason"
          v-model="reason"
          type="text"
          maxlength="200"
          autocomplete="off"
          class="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-red-500"
          placeholder="e.g. cracked, missing parts"
        />

        <p v-if="message" class="mt-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ message }}</p>

        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="rounded-2xl bg-zinc-800 px-5 py-3 font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="busy"
          >
            {{ busy ? 'Disabling…' : 'Disable and notify the owner' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import NavIcon from './NavIcon.vue'
import { DISABLE_REASONS } from '../lib/disabledProducts'

const props = defineProps({
  product: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['confirm', 'cancel'])

const reason = ref('')
const missing = ref('')
const message = computed(() => missing.value || props.error)

function submit() {
  const text = reason.value.trim()
  if (text.length < 3) {
    missing.value = 'Pick or type the reason first.'
    return
  }
  missing.value = ''
  emit('confirm', text)
}
</script>
