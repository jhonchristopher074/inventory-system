<script setup>
// A month on a grid, like a wall calendar. Each day shows its items as
// small chips (on phones, coloured dots); a click on a day tells the page.
//
//   <MonthCalendar :events="events" :today="'2026-11-08'" @pick="(date) => ..." />
//
//   events  [{ key, date: 'YYYY-MM-DD', kind: 'inspection' | 'delivery',
//              title, state: 'overdue' | 'done' | 'arrived' | '' }]
//
// The month shown is the page's (v-model:month, 'YYYY-MM'); ‹ › and Today
// change it.
import { computed } from 'vue'

const props = defineProps({
  events: { type: Array, default: () => [] },
  today: { type: String, required: true },
  month: { type: String, required: true }, // 'YYYY-MM'
})

const emit = defineEmits(['pick', 'update:month'])

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3

const pad = (n) => String(n).padStart(2, '0')
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const firstOfMonth = computed(() => {
  const [y, m] = props.month.split('-').map(Number)
  return new Date(y, m - 1, 1)
})

const title = computed(() =>
  firstOfMonth.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
)

// the items of each day
const byDay = computed(() => {
  const map = new Map()
  for (const event of props.events) {
    if (!event.date) continue
    const day = String(event.date).slice(0, 10)
    if (!map.has(day)) map.set(day, [])
    map.get(day).push(event)
  }
  // late ones first, then inspections before deliveries
  const rank = (e) => (e.state === 'overdue' ? 0 : e.state === 'done' ? 2 : 1)
  for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b) || a.kind.localeCompare(b.kind))
  return map
})

// 6 weeks of 7 days, starting on the Sunday on or before the 1st
const days = computed(() => {
  const first = firstOfMonth.value
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  const out = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = keyOf(d)
    out.push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === first.getMonth(),
      isToday: key === props.today,
      isPast: key < props.today,
      items: byDay.value.get(key) || [],
    })
  }
  // a month that fits in 5 weeks doesn't show an empty 6th row
  return out.slice(35).every((d) => !d.inMonth) ? out.slice(0, 35) : out
})

// items before / after the month shown: a mark on ‹ and ›
const monthStart = computed(() => `${props.month}-01`)
const monthEnd = computed(() => {
  const first = firstOfMonth.value
  return keyOf(new Date(first.getFullYear(), first.getMonth() + 1, 0))
})
const earlier = computed(() => props.events.filter((e) => e.date && String(e.date).slice(0, 10) < monthStart.value))
const later = computed(() => props.events.filter((e) => e.date && String(e.date).slice(0, 10) > monthEnd.value))
const earlierOverdue = computed(() => earlier.value.filter((e) => e.state === 'overdue').length)

function markText(list, overdue, where) {
  if (!list.length) return ''
  const things = `${list.length} ${list.length === 1 ? 'item' : 'items'} ${where}`
  return overdue ? `${things}, ${overdue} overdue` : things
}

const monthCount = computed(() =>
  days.value.filter((d) => d.inMonth).reduce((sum, d) => sum + d.items.length, 0)
)

function move(by) {
  const d = new Date(firstOfMonth.value.getFullYear(), firstOfMonth.value.getMonth() + by, 1)
  emit('update:month', `${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
}

function goToday() {
  emit('update:month', props.today.slice(0, 7))
}

function dayLabel(day) {
  const d = new Date(`${day.key}T00:00:00`)
  const when = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  if (!day.items.length) return `${when}, nothing scheduled`
  return `${when}, ${day.items.length} scheduled`
}
</script>

<template>
  <section class="cal card" aria-label="Month calendar">
    <!-- ‹ November 2026 ›   Today -->
    <header class="cal-head">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="cal-nav"
          :aria-label="'Previous month' + (earlier.length ? ` (${markText(earlier, earlierOverdue, 'in earlier months')})` : '')"
          :title="markText(earlier, earlierOverdue, 'in earlier months')"
          @click="move(-1)"
        >
          ‹
          <!-- something earlier: orange with its count when overdue -->
          <span
            v-if="earlier.length"
            class="cal-mark"
            :class="earlierOverdue ? 'is-overdue' : ''"
            aria-hidden="true"
          >{{ earlierOverdue || '' }}</span>
        </button>
        <h2 class="cal-title">{{ title }}</h2>
        <button
          type="button"
          class="cal-nav"
          :aria-label="'Next month' + (later.length ? ` (${markText(later, 0, 'in later months')})` : '')"
          :title="markText(later, 0, 'in later months')"
          @click="move(1)"
        >
          ›
          <span v-if="later.length" class="cal-mark" aria-hidden="true"></span>
        </button>
      </div>
      <span class="hidden text-xs text-zinc-500 sm:inline">
        {{ monthCount }} scheduled this month
      </span>
      <button
        type="button"
        class="cal-today"
        :disabled="month === today.slice(0, 7)"
        @click="goToday"
      >
        Today
      </button>
    </header>

    <div class="cal-grid" role="grid">
      <div v-for="name in WEEKDAYS" :key="name" class="cal-weekday" role="columnheader">
        <span class="sm:hidden">{{ name[0] }}</span><span class="hidden sm:inline">{{ name }}</span>
      </div>

      <button
        v-for="day in days"
        :key="day.key"
        type="button"
        role="gridcell"
        class="cal-day"
        :class="{
          'is-out': !day.inMonth,
          'is-today': day.isToday,
          'is-past': day.isPast,
          'has-items': day.items.length,
          'has-overdue': day.items.some((e) => e.state === 'overdue'),
        }"
        :aria-label="dayLabel(day)"
        @click="emit('pick', day.key)"
      >
        <span class="cal-num">{{ day.day }}</span>

        <!-- computers: chips with the names -->
        <span class="cal-chips">
          <span
            v-for="event in day.items.slice(0, MAX_CHIPS)"
            :key="event.key"
            class="cal-chip"
            :class="[`kind-${event.kind}`, event.state && `state-${event.state}`]"
            :title="event.title"
          >
            <span class="cal-chip-dot" aria-hidden="true"></span>
            <span class="truncate">{{ event.title }}</span>
          </span>
          <span v-if="day.items.length > MAX_CHIPS" class="cal-more">
            +{{ day.items.length - MAX_CHIPS }} more
          </span>
        </span>

        <!-- phones: a dot for each (up to 4) -->
        <span v-if="day.items.length" class="cal-dots" aria-hidden="true">
          <span
            v-for="event in day.items.slice(0, 4)"
            :key="event.key"
            class="cal-dot"
            :class="[`kind-${event.kind}`, event.state && `state-${event.state}`]"
          ></span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.cal {
  overflow: hidden;
  padding: 0;
}

.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--hairline);
  padding: 0.75rem 1rem;
}

.cal-title {
  min-width: 10.5rem;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 800;
  color: #fff;
}

.cal-nav {
  position: relative;
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 0.6rem;
  font-size: 1.3rem;
  line-height: 1;
  color: var(--color-zinc-300);
}

.cal-nav:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
}

/* on ‹ / ›: there's something that way. A small dot, or orange with
   the number of overdue items, pulsing */
.cal-mark {
  position: absolute;
  top: -0.15rem;
  right: -0.15rem;
  display: grid;
  min-width: 0.6rem;
  height: 0.6rem;
  place-items: center;
  border-radius: 999px;
  background: var(--color-zinc-400);
  font-size: 0.6rem;
  font-weight: 800;
  line-height: 1;
  color: #1a1000;
}

.cal-mark.is-overdue {
  min-width: 1.05rem;
  height: 1.05rem;
  padding: 0 0.2rem;
  background: #ff9500;
}

.cal-mark.is-overdue::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 2px solid #ff9500;
  animation: mark-pulse 1.6s ease-out infinite;
}

@keyframes mark-pulse {
  from {
    transform: scale(1);
    opacity: 0.9;
  }
  to {
    transform: scale(1.8);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cal-mark.is-overdue::after {
    animation: none;
    opacity: 0;
  }
}

.cal-today {
  border-radius: 0.6rem;
  border: 1px solid var(--hairline);
  padding: 0.35rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-zinc-200);
}

.cal-today:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.cal-today:disabled {
  opacity: 0.4;
  cursor: default;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.cal-weekday {
  border-bottom: 1px solid var(--hairline);
  padding: 0.5rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

.cal-day {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 7rem;
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
  border-right: 1px solid var(--hairline-soft);
  border-bottom: 1px solid var(--hairline-soft);
  padding: 0.4rem 0.45rem;
  text-align: left;
  transition: background-color 0.12s var(--ease);
}

.cal-day:nth-child(7n) {
  border-right: 0;
}

.cal-day:hover,
.cal-day:focus-visible {
  outline: none;
  background: rgba(255, 255, 255, 0.04);
}

.cal-day.is-out {
  background: rgba(0, 0, 0, 0.18);
}

.cal-day.is-out .cal-num {
  color: var(--color-zinc-600);
}

.cal-num {
  display: grid;
  width: 1.7rem;
  height: 1.7rem;
  place-items: center;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-zinc-300);
}

.cal-day.is-past:not(.is-out) .cal-num {
  color: var(--color-zinc-500);
}

/* today: a red circle on the date and a soft outline on the day */
.cal-day.is-today {
  box-shadow: inset 0 0 0 1px rgba(244, 52, 76, 0.55);
}

.cal-day.is-today .cal-num {
  background: var(--brand);
  color: #fff;
}

.cal-chips {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.2rem;
}

.cal-chip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.3rem;
  border-radius: 0.4rem;
  padding: 0.15rem 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.3;
}

.cal-chip-dot,
.cal-dot {
  flex: none;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: currentColor;
}

/* inspection: violet · delivery: sky blue */
.kind-inspection {
  background: rgba(167, 139, 250, 0.16);
  color: #c4b5fd;
}

.kind-delivery {
  background: rgba(56, 189, 248, 0.15);
  color: #7dd3fc;
}

/* late: orange, whatever it is */
.state-overdue {
  background: rgba(255, 149, 0, 0.18);
  color: #ffb547;
  box-shadow: inset 0 0 0 1px rgba(255, 149, 0, 0.45);
}

/* arrived, waiting on its receipt */
.state-arrived {
  background: rgba(251, 191, 36, 0.14);
  color: #fcd34d;
}

.state-done {
  opacity: 0.5;
}

.cal-more {
  padding-left: 0.4rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-zinc-400);
}

.cal-dots {
  display: none;
  flex-wrap: wrap;
  gap: 0.2rem;
  padding-left: 0.25rem;
}

.cal-dot {
  width: 0.45rem;
  height: 0.45rem;
}

.cal-dot.kind-inspection,
.cal-dot.kind-delivery,
.cal-dot.state-overdue,
.cal-dot.state-arrived {
  box-shadow: none;
}

.cal-dot.kind-inspection { background: #a78bfa; }
.cal-dot.kind-delivery { background: #38bdf8; }
.cal-dot.state-overdue { background: #ff9500; }
.cal-dot.state-arrived { background: #fbbf24; }

/* phones: dots instead of names; a tap opens the day */
@media (max-width: 760px) {
  .cal-head {
    padding: 0.6rem 0.6rem;
  }

  .cal-title {
    min-width: 0;
    font-size: 0.95rem;
  }

  .cal-weekday {
    padding: 0.4rem 0;
    text-align: center;
  }

  .cal-day {
    min-height: 3.6rem;
    align-items: center;
    padding: 0.3rem 0.1rem;
  }

  .cal-chips {
    display: none;
  }

  .cal-dots {
    display: flex;
    justify-content: center;
    padding-left: 0;
  }
}
</style>
