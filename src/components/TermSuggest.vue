<script setup>
// A text box that suggests names while you type: the word being typed
// (after the last comma) is matched against `options`, letter by letter,
// and the matches show under the box. Picking one (click, or ↑ ↓ then
// Enter / Tab) puts it in and adds ", " for the next one. Esc closes the
// list.
//
//   <TermSuggest v-model="text" :options="[{ text: 'Umbrella Nails', hint: 'in Fasteners' }]"
//                class="input" placeholder="…" />
//
// Everything else given to it (class, placeholder, maxlength, aria-label)
// goes on the text box itself. `multiline` makes it a textarea.
import { computed, ref, useId, watch } from 'vue'

defineOptions({ inheritAttrs: false })

const model = defineModel({ type: String, default: '' })

const props = defineProps({
  // [{ text, hint }] (or plain strings): what can be suggested
  options: { type: Array, default: () => [] },
  multiline: { type: Boolean, default: false },
  // how many suggestions at most
  limit: { type: Number, default: 6 },
})

const box = ref(null)
const focused = ref(false)
const dismissed = ref(false) // Esc: closed until the next letter
const active = ref(0)
const listId = `suggest-${useId()}`

// the word being typed: after the last comma
const term = computed(() => model.value.split(',').pop().trim().toLowerCase())

// the ones already written before it aren't suggested again
const taken = computed(
  () => new Set(model.value.split(',').slice(0, -1).map((part) => part.trim().toLowerCase()))
)

// names starting with what's typed first, then names containing it
const matches = computed(() => {
  const q = term.value
  if (!q) return []

  const seen = new Set()
  const starts = []
  const contains = []

  for (const option of props.options) {
    const item = typeof option === 'string' ? { text: option } : option
    const lower = String(item.text || '').toLowerCase()
    if (!lower || lower === q || seen.has(lower) || taken.value.has(lower)) continue
    seen.add(lower)

    const at = lower.indexOf(q)
    if (at === 0) starts.push({ ...item, at })
    else if (at > 0) contains.push({ ...item, at })
  }

  return [...starts, ...contains].slice(0, props.limit).map((item) => ({
    ...item,
    before: item.text.slice(0, item.at),
    match: item.text.slice(item.at, item.at + q.length),
    after: item.text.slice(item.at + q.length),
  }))
})

const open = computed(() => focused.value && !dismissed.value && matches.value.length > 0)

watch(matches, () => {
  active.value = 0
})

function pick(item) {
  const parts = model.value.split(',')
  parts[parts.length - 1] = (parts.length > 1 ? ' ' : '') + item.text
  model.value = parts.join(',') + ', '
  box.value?.focus()
}

function onKeydown(event) {
  if (!open.value) return

  const count = matches.value.length

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % count
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + count) % count
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    pick(matches.value[active.value])
  } else if (event.key === 'Escape') {
    // close the list only, not the window it's in
    event.stopPropagation()
    dismissed.value = true
  }
}

function onInput(event) {
  model.value = event.target.value
  dismissed.value = false
  focused.value = true // typing in it: it has the focus, even if no focus event came
}
</script>

<template>
  <div class="relative">
    <textarea
      v-if="multiline"
      ref="box"
      v-bind="$attrs"
      :value="model"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open ? `${listId}-${active}` : undefined"
      @input="onInput"
      @keydown="onKeydown"
      @focus="focused = true"
      @blur="focused = false"
    ></textarea>
    <input
      v-else
      ref="box"
      v-bind="$attrs"
      :value="model"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open ? `${listId}-${active}` : undefined"
      @input="onInput"
      @keydown="onKeydown"
      @focus="focused = true"
      @blur="focused = false"
    />

    <!-- mousedown.prevent: the box keeps the focus, so a click picks -->
    <ul
      v-if="open"
      :id="listId"
      role="listbox"
      class="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl"
    >
      <li
        v-for="(item, i) in matches"
        :id="`${listId}-${i}`"
        :key="item.text"
        role="option"
        :aria-selected="i === active"
        class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
        :class="i === active ? 'bg-white/10 text-white' : 'text-zinc-300'"
        @mousedown.prevent="pick(item)"
        @mouseenter="active = i"
      >
        <span class="min-w-0 truncate">
          {{ item.before }}<b class="font-bold text-red-400">{{ item.match }}</b>{{ item.after }}
        </span>
        <span v-if="item.hint" class="shrink-0 text-xs text-zinc-500">{{ item.hint }}</span>
      </li>
    </ul>
  </div>
</template>
