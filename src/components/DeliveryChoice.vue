<script setup>
// "Which delivery is this receipt for?": one card per delivery that arrived
// and waits for its receipt, plus "Not for a delivery". v-model is the
// chosen delivery's id as text, '' for none.
import { useId } from 'vue'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  deliveries: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const model = defineModel({ type: String, default: '' })
const name = useId()

function dayOf(delivery) {
  const day = String(delivery?.delivery_date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function pick(value) {
  if (!props.disabled) model.value = value
}
</script>

<template>
  <div class="space-y-2" role="radiogroup">
    <label
      v-for="delivery in deliveries"
      :key="delivery.id"
      class="choice"
      :class="{ 'is-on': model === String(delivery.id), 'is-off': disabled }"
    >
      <input
        type="radio"
        class="sr-only"
        :name="name"
        :value="String(delivery.id)"
        :checked="model === String(delivery.id)"
        :disabled="disabled"
        @change="pick(String(delivery.id))"
      />
      <span class="choice-icon bg-sky-500/15 text-sky-300">
        <NavIcon name="inventory" class="h-4 w-4" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-bold text-white">{{ delivery.title || 'Delivery' }}</span>
        <span class="block truncate text-xs text-zinc-400">
          <template v-if="delivery.supplier">From <b class="text-zinc-200">{{ delivery.supplier }}</b></template>
          <template v-if="delivery.supplier && dayOf(delivery)"> · </template>
          <template v-if="dayOf(delivery)">arrived {{ dayOf(delivery) }}</template>
        </span>
      </span>
      <span class="choice-dot" aria-hidden="true"></span>
    </label>

    <label class="choice" :class="{ 'is-on': model === '', 'is-off': disabled }">
      <input
        type="radio"
        class="sr-only"
        :name="name"
        value=""
        :checked="model === ''"
        :disabled="disabled"
        @change="pick('')"
      />
      <span class="choice-icon bg-white/5 text-zinc-400">
        <NavIcon name="docs" class="h-4 w-4" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block font-bold text-white">Not for a delivery</span>
        <span class="block text-xs text-zinc-400">A receipt on its own</span>
      </span>
      <span class="choice-dot" aria-hidden="true"></span>
    </label>
  </div>
</template>

<style scoped>
.choice {
  display: flex;
  cursor: pointer;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.875rem;
  border: 1px solid rgb(255 255 255 / 0.1);
  background: rgb(0 0 0 / 0.25);
  padding: 0.7rem 0.85rem;
  transition: border-color 0.15s, background-color 0.15s;
}
.choice:hover { border-color: rgb(255 255 255 / 0.22); }
.choice:focus-within { outline: 2px solid rgb(56 189 248 / 0.6); outline-offset: 2px; }
.choice.is-on {
  border-color: rgb(56 189 248 / 0.7);
  background: rgb(56 189 248 / 0.1);
}
.choice.is-off { cursor: default; opacity: 0.6; }

.choice-icon {
  display: grid;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  place-items: center;
  border-radius: 0.65rem;
}

/* the radio's dot, on the right */
.choice-dot {
  height: 1.15rem;
  width: 1.15rem;
  flex-shrink: 0;
  border-radius: 999px;
  border: 2px solid rgb(255 255 255 / 0.25);
}
.choice.is-on .choice-dot {
  border-color: rgb(56 189 248);
  background: radial-gradient(circle, rgb(56 189 248) 0 45%, transparent 50%);
}
</style>
