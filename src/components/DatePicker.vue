<script setup>
// The app's own date picker (the browser's can't be styled): a button that
// shows the date, and a dark month calendar under it. On phones it opens as a
// sheet at the bottom of the screen.
//
//   <DatePicker v-model="date" :min="today" placeholder="Pick a date" quick />
//
//   v-model   'YYYY-MM-DD' ('' = none)
//   min, max  'YYYY-MM-DD': days outside are greyed out and can't be picked
//   quick     shows Today / Tomorrow / In a week (when allowed)
//   clearable shows Clear
// Keyboard: arrows move a day / week, PageUp / PageDown a month, Enter picks,
// Esc closes.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  min: { type: String, default: '' },
  max: { type: String, default: '' },
  placeholder: { type: String, default: 'Pick a date' },
  id: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  quick: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  // the button's look: 'field' (a form box) or 'compact' (a filter)
  size: { type: String, default: 'field' },
})

const emit = defineEmits(['update:modelValue'])

// extra attributes (aria-labelledby, ...) go on the button, not the popup
defineOptions({ inheritAttrs: false })

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

const today = () => ymd(new Date())

function allowed(day) {
  if (!day) return false
  if (props.min && day < props.min) return false
  if (props.max && day > props.max) return false
  return true
}

/* ---------------- the button ---------------- */
const label = computed(() => {
  if (!props.modelValue) return ''
  return parse(props.modelValue).toLocaleDateString(undefined, {
    weekday: props.size === 'compact' ? undefined : 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
})

/* ---------------- open / close ---------------- */
const open = ref(false)
const trigger = ref(null)
const panel = ref(null)
const place = ref({}) // where the panel goes (computers)
const sheet = ref(false) // phones: a sheet at the bottom

// the day under the keyboard, and the month shown
const focusDay = ref('')
const shownMonth = ref('') // 'YYYY-MM'

function startDay() {
  if (props.modelValue) return props.modelValue
  const t = today()
  if (allowed(t)) return t
  return props.min && t < props.min ? props.min : props.max || t
}

function position() {
  const box = trigger.value?.getBoundingClientRect()
  if (!box) return
  sheet.value = window.innerWidth < 640
  if (sheet.value) return
  const width = 300
  const height = 390
  const below = window.innerHeight - box.bottom
  const top = below > height + 12 || box.top < height ? box.bottom + 6 : box.top - height - 6
  const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8)
  place.value = { top: `${Math.max(8, top)}px`, left: `${left}px`, width: `${width}px` }
}

function show() {
  if (props.disabled) return
  focusDay.value = startDay()
  shownMonth.value = focusDay.value.slice(0, 7)
  position()
  open.value = true
  nextTick(() => panel.value?.querySelector('.dp-day.is-focus')?.focus())
}

function close(refocus = true) {
  open.value = false
  if (refocus) nextTick(() => trigger.value?.focus())
}

function toggle() {
  if (open.value) close()
  else show()
}

function onOutside(event) {
  if (!open.value) return
  if (panel.value?.contains(event.target) || trigger.value?.contains(event.target)) return
  close(false)
}

function onScrollOrResize() {
  if (open.value && !sheet.value) position()
}

watch(open, (isOpen) => {
  const method = isOpen ? 'addEventListener' : 'removeEventListener'
  document[method]('mousedown', onOutside, true)
  document[method]('touchstart', onOutside, true)
  window[method]('resize', onScrollOrResize)
  window[method]('scroll', onScrollOrResize, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onOutside, true)
  document.removeEventListener('touchstart', onOutside, true)
  window.removeEventListener('resize', onScrollOrResize)
  window.removeEventListener('scroll', onScrollOrResize, true)
})

/* ---------------- the month ---------------- */
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const monthTitle = computed(() => {
  if (!shownMonth.value) return ''
  return parse(`${shownMonth.value}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

const days = computed(() => {
  if (!shownMonth.value) return []
  const first = parse(`${shownMonth.value}-01`)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  const out = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = ymd(d)
    out.push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
      isToday: key === today(),
      isPicked: key === props.modelValue,
      ok: allowed(key),
    })
  }
  return out
})

// can ‹ / › go there (a month with at least one allowed day)
function monthOk(monthKey) {
  const first = `${monthKey}-01`
  const last = ymd(new Date(parse(first).getFullYear(), parse(first).getMonth() + 1, 0))
  if (props.min && last < props.min) return false
  if (props.max && first > props.max) return false
  return true
}

function shiftMonth(by) {
  const d = parse(`${shownMonth.value}-01`)
  const next = new Date(d.getFullYear(), d.getMonth() + by, 1)
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}`
}

const canPrev = computed(() => shownMonth.value && monthOk(shiftMonth(-1)))
const canNext = computed(() => shownMonth.value && monthOk(shiftMonth(1)))

function goMonth(by) {
  const target = shiftMonth(by)
  if (!monthOk(target)) return
  shownMonth.value = target
  // keep the keyboard day in the month shown
  const d = parse(focusDay.value)
  const last = new Date(parse(`${target}-01`).getFullYear(), parse(`${target}-01`).getMonth() + 1, 0).getDate()
  focusDay.value = `${target}-${pad(Math.min(d.getDate(), last))}`
}

/* ---------------- picking ---------------- */
function pick(day) {
  if (!allowed(day)) return
  emit('update:modelValue', day)
  close()
}

function clear() {
  emit('update:modelValue', '')
  close()
}

const quickChoices = computed(() => {
  if (!props.quick) return []
  const t = today()
  return [
    { label: 'Today', day: t },
    { label: 'Tomorrow', day: addDays(t, 1) },
    { label: 'In a week', day: addDays(t, 7) },
  ].filter((choice) => allowed(choice.day))
})

/* ---------------- keyboard ---------------- */
function onKey(event) {
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key in moves || event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault()
    let next = focusDay.value
    if (event.key in moves) next = addDays(next, moves[event.key])
    else {
      const d = parse(next)
      d.setMonth(d.getMonth() + (event.key === 'PageUp' ? -1 : 1))
      next = ymd(d)
    }
    if (props.min && next < props.min) next = props.min
    if (props.max && next > props.max) next = props.max
    focusDay.value = next
    shownMonth.value = next.slice(0, 7)
    nextTick(() => panel.value?.querySelector('.dp-day.is-focus')?.focus())
  }
}
</script>

<template>
  <button
    v-bind="$attrs"
    :id="id"
    ref="trigger"
    type="button"
    class="dp-trigger"
    :class="[`size-${size}`, { 'is-open': open, 'is-empty': !modelValue }]"
    :disabled="disabled"
    :aria-expanded="open"
    aria-haspopup="dialog"
    @click="toggle"
  >
    <NavIcon name="calendar" class="dp-trigger-icon" />
    <span class="min-w-0 flex-1 truncate text-left">{{ label || placeholder }}</span>
    <span class="dp-caret" aria-hidden="true">▾</span>
  </button>

  <Teleport to="body">
    <div v-if="open && sheet" class="dp-scrim" @click="close(false)"></div>
    <div
      v-if="open"
      ref="panel"
      class="dp-panel"
      :class="{ 'is-sheet': sheet }"
      :style="sheet ? null : place"
      role="dialog"
      aria-modal="false"
      aria-label="Choose a date"
      @keydown="onKey"
    >
      <!-- ‹ November 2026 › -->
      <div class="dp-head">
        <button type="button" class="dp-nav" :disabled="!canPrev" aria-label="Previous month" @click="goMonth(-1)">‹</button>
        <p class="dp-title" aria-live="polite">{{ monthTitle }}</p>
        <button type="button" class="dp-nav" :disabled="!canNext" aria-label="Next month" @click="goMonth(1)">›</button>
      </div>

      <div class="dp-grid" role="grid">
        <span v-for="name in WEEKDAYS" :key="name" class="dp-weekday" role="columnheader">{{ name }}</span>
        <button
          v-for="day in days"
          :key="day.key"
          type="button"
          role="gridcell"
          class="dp-day"
          :class="{
            'is-out': !day.inMonth,
            'is-today': day.isToday,
            'is-picked': day.isPicked,
            'is-focus': day.key === focusDay,
          }"
          :disabled="!day.ok"
          :tabindex="day.key === focusDay ? 0 : -1"
          :aria-selected="day.isPicked"
          :aria-label="new Date(`${day.key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })"
          @click="pick(day.key)"
        >
          {{ day.day }}
        </button>
      </div>

      <div v-if="quickChoices.length || clearable" class="dp-foot">
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="choice in quickChoices"
            :key="choice.label"
            type="button"
            class="dp-quick"
            :class="{ 'is-on': choice.day === modelValue }"
            @click="pick(choice.day)"
          >
            {{ choice.label }}
          </button>
        </div>
        <button v-if="clearable && modelValue" type="button" class="dp-clear" @click="clear">Clear</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ---- the button (looks like the app's other boxes) ---- */
.dp-trigger {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 0.6rem;
  border-radius: 0.85rem;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
  padding: 0.75rem 0.9rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  text-align: left;
  transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
}

.dp-trigger.size-compact {
  width: auto;
  border-radius: 0.75rem;
  padding: 0.5rem 0.7rem;
  font-size: 0.85rem;
}

.dp-trigger:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.2);
}

.dp-trigger:focus-visible,
.dp-trigger.is-open {
  outline: none;
  border-color: rgba(244, 52, 76, 0.6);
  box-shadow: 0 0 0 3px rgba(224, 27, 50, 0.16);
}

.dp-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.dp-trigger.is-empty {
  color: var(--color-zinc-500);
  font-weight: 500;
}

.dp-trigger-icon {
  width: 1.1rem;
  height: 1.1rem;
  flex: none;
  color: var(--brand-bright);
}

.dp-caret {
  flex: none;
  font-size: 0.75rem;
  color: var(--color-zinc-500);
}

/* ---- the calendar ---- */
.dp-panel {
  position: fixed;
  z-index: 3000;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: var(--surface-raised);
  box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.75);
  padding: 0.85rem;
  color: #fff;
  animation: dp-in 0.12s var(--ease);
}

@keyframes dp-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

/* phones: a sheet at the bottom of the screen, big taps */
.dp-panel.is-sheet {
  right: 0;
  bottom: 0;
  left: 0;
  border-radius: 22px 22px 0 0;
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
  animation: dp-up 0.18s var(--ease);
}

@keyframes dp-up {
  from {
    transform: translateY(100%);
  }
}

.dp-scrim {
  position: fixed;
  inset: 0;
  z-index: 2999;
  background: rgba(0, 0, 0, 0.6);
}

.dp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.dp-title {
  font-size: 0.98rem;
  font-weight: 800;
}

.dp-nav {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 0.6rem;
  font-size: 1.3rem;
  line-height: 1;
  color: var(--color-zinc-300);
}

.dp-nav:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.dp-nav:disabled {
  opacity: 0.25;
  cursor: default;
}

.dp-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.15rem;
}

.dp-weekday {
  padding: 0.3rem 0;
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

.dp-day {
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 0.6rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-zinc-200);
  transition: background-color 0.1s;
}

.dp-day:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.dp-day.is-out {
  color: var(--color-zinc-600);
}

/* past / not allowed: faded and struck out, can't be picked */
.dp-day:disabled {
  cursor: not-allowed;
  color: var(--color-zinc-600);
  text-decoration: line-through;
  text-decoration-color: rgba(255, 255, 255, 0.15);
  opacity: 0.55;
}

.dp-day.is-today {
  box-shadow: inset 0 0 0 1.5px rgba(244, 52, 76, 0.7);
  color: #fff;
}

.dp-day.is-picked {
  background: var(--brand);
  color: #fff;
  font-weight: 800;
  box-shadow: 0 4px 12px -4px rgba(224, 27, 50, 0.7);
}

.dp-day:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.7);
  outline-offset: 1px;
}

.dp-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.65rem;
  border-top: 1px solid var(--hairline);
  padding-top: 0.65rem;
}

.dp-quick {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.3rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-zinc-200);
}

.dp-quick:hover {
  background: rgba(255, 255, 255, 0.12);
}

.dp-quick.is-on {
  background: rgba(224, 27, 50, 0.2);
  color: #ff8a98;
}

.dp-clear {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-zinc-400);
}

.dp-clear:hover {
  color: #fff;
}

.dp-panel.is-sheet .dp-day {
  font-size: 1rem;
}
</style>
