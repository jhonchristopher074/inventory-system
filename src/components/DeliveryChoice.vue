<script setup>
// "Is this the receipt of an arrived delivery?" Yes / No. Yes shows a
// dropdown of the deliveries that arrived and wait for their receipt (name,
// who delivers it, the day), then a box naming the chosen one. No: nothing
// more to fill in. v-model is the chosen delivery's id as text, '' for none.
import { computed, ref, useId, watch } from 'vue'

const props = defineProps({
  deliveries: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  question: { type: String, default: 'Is this the receipt of an arrived delivery?' },
})

const model = defineModel({ type: String, default: '' })
const uid = useId()

// starts on Yes when a delivery is already chosen (e.g. the only one from
// the same supplier)
const answer = ref(model.value ? 'yes' : 'no')

watch(model, (value) => {
  if (value) answer.value = 'yes'
})

const chosen = computed(() => props.deliveries.find((item) => String(item.id) === model.value) || null)

function dayOf(delivery) {
  const day = String(delivery?.delivery_date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function optionText(delivery) {
  let text = delivery.title || 'Delivery'
  if (delivery.supplier) text += ` — from ${delivery.supplier}`
  if (dayOf(delivery)) text += ` (${dayOf(delivery)})`
  return text
}

function setAnswer(value) {
  if (props.disabled) return
  answer.value = value
  if (value === 'no') model.value = ''
  // only one to choose from: choose it
  else if (!model.value && props.deliveries.length === 1) model.value = String(props.deliveries[0].id)
}
</script>

<template>
  <div>
    <p class="mb-2 text-sm font-bold text-zinc-300">{{ question }}</p>

    <div class="grid grid-cols-2 gap-2" role="group" :aria-label="question">
      <button
        type="button"
        class="answer"
        :class="{ 'is-on': answer === 'yes' }"
        :aria-pressed="answer === 'yes'"
        :disabled="disabled"
        @click="setAnswer('yes')"
      >
        Yes
      </button>
      <button
        type="button"
        class="answer"
        :class="{ 'is-on': answer === 'no' }"
        :aria-pressed="answer === 'no'"
        :disabled="disabled"
        @click="setAnswer('no')"
      >
        No
      </button>
    </div>

    <template v-if="answer === 'yes'">
      <label class="mb-1.5 mt-3 block text-xs font-semibold text-zinc-400" :for="`${uid}-delivery`">
        Which delivery? (these arrived and wait for their receipt)
      </label>
      <select :id="`${uid}-delivery`" v-model="model" class="pick" :disabled="disabled">
        <option value="" disabled>Choose the delivery…</option>
        <option v-for="delivery in deliveries" :key="delivery.id" :value="String(delivery.id)">
          {{ optionText(delivery) }}
        </option>
      </select>

      <p v-if="chosen" class="mt-2 rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
        For the delivery <b class="text-white">{{ chosen.title || 'Delivery' }}</b>
        <template v-if="chosen.supplier"> · from <b class="text-white">{{ chosen.supplier }}</b></template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.answer {
  border-radius: 0.75rem;
  border: 1px solid rgb(255 255 255 / 0.1);
  background: rgb(0 0 0 / 0.25);
  padding: 0.6rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: rgb(212 212 216);
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}
.answer:hover:not(:disabled) { border-color: rgb(255 255 255 / 0.25); color: white; }
.answer.is-on {
  border-color: rgb(56 189 248 / 0.7);
  background: rgb(56 189 248 / 0.12);
  color: white;
}
.answer:disabled { cursor: default; opacity: 0.6; }

.pick {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgb(255 255 255 / 0.1);
  background: black;
  padding: 0.7rem 0.85rem;
  font-size: 0.9rem;
  color: white;
}
.pick:focus { outline: 2px solid rgb(56 189 248 / 0.6); outline-offset: 1px; }
</style>
