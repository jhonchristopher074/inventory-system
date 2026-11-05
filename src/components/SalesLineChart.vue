<script setup>
// Sales over time as a line (Dashboard: last 7 days; Sales History: per day
// or per month). Hover a point, or Tab to it, for its total and number of
// sales; screen readers hear the same.
//
//   <SalesLineChart :points="points" name="Sales per day" />
//   points: [{ key, label, title, total, count, current }]
//     label   under the chart ('Mon', 'Oct 24')
//     title   in the tooltip ('Monday, Oct 24'); the label if left out
//     current the point that is now (today): its label stands out
//
// It is at least 11rem tall, and grows with a taller box around it (the
// Dashboard stretches it to the card next to it).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { count, niceTop, peso, pesoShort } from '../lib/format'

const props = defineProps({
  points: { type: Array, required: true },
  // what the points are, for screen readers
  name: { type: String, default: 'Sales' },
  // shown over the chart when every point is ₱0
  emptyText: { type: String, default: 'No sales.' },
})

const top = computed(() => niceTop(Math.max(0, ...props.points.map((p) => p.total))))

// the scale: top, middle and bottom line
const lines = computed(() => [top.value, top.value / 2, 0])

// each point in the middle of its column; heights in % of the scale
const placed = computed(() => {
  const n = props.points.length

  return props.points.map((point, i) => ({
    ...point,
    x: ((i + 0.5) / n) * 100,
    pct: (point.total / top.value) * 100,
  }))
})

// drawn on a 100 × 100 box that stretches to the chart's size
const linePath = computed(() => 'M' + placed.value.map((p) => `${p.x},${100 - p.pct}`).join('L'))

const areaPath = computed(() => {
  const list = placed.value
  if (list.length === 0) return ''
  return `M${list[0].x},100L${list.map((p) => `${p.x},${100 - p.pct}`).join('L')}L${list[list.length - 1].x},100Z`
})

// a dot on every point while they aren't crowded; otherwise only on hover
const showDots = computed(() => props.points.length <= 14)

// As many labels under the chart as fit its width (a month label like
// "May 2026" needs about 60px), 8 at most; on a phone the months crowded
// into each other. "Now" is always shown, so the ones too close to it go.
const root = ref(null)
const width = ref(0)
let observer = null

onMounted(() => {
  if (!root.value || typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(([entry]) => {
    width.value = entry.contentRect.width
  })
  observer.observe(root.value)
})

onBeforeUnmount(() => observer?.disconnect())

const longestLabel = computed(() => Math.max(1, ...props.points.map((p) => String(p.label || '').length)))

const labelEvery = computed(() => {
  const n = props.points.length
  const room = Math.max(longestLabel.value * 7 + 10, 36) // px one label needs
  const fit = width.value ? Math.max(2, Math.floor((width.value - 56) / room)) : 8
  return Math.max(1, Math.ceil(n / Math.min(8, fit)))
})

function showLabel(point, i) {
  if (point.current) return true
  if (i % labelEvery.value !== 0) return false
  const now = placed.value.findIndex((p) => p.current)
  return now < 0 || Math.abs(now - i) >= labelEvery.value
}

const noSales = computed(() => props.points.every((p) => p.total === 0))

function salesText(n) {
  return `${count(n)} sale${n === 1 ? '' : 's'}`
}

// tooltips of the first and last points open inwards, to stay in the card
function tipSide(i) {
  const n = props.points.length
  if (i < n / 5) return 'left-0'
  if (i >= (n * 4) / 5) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}
</script>

<template>
  <div ref="root" class="flex flex-col">
    <div class="flex min-h-44 flex-1 gap-2">
      <!-- the scale: three clean amounts, with faint lines across -->
      <div class="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-500" aria-hidden="true">
        <span
          v-for="(line, i) in lines"
          :key="line"
          class="absolute right-0 -translate-y-1/2 leading-none"
          :style="{ top: `${i * 50}%` }"
        >
          {{ pesoShort(line) }}
        </span>
      </div>

      <div class="relative min-w-0 flex-1">
        <div
          v-for="(line, i) in lines"
          :key="line"
          class="absolute inset-x-0 border-t"
          :class="i === lines.length - 1 ? 'border-white/15' : 'border-white/5'"
          :style="{ top: `${i * 50}%` }"
          aria-hidden="true"
        ></div>

        <!-- the line, with a faint wash under it -->
        <svg
          class="absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path :d="areaPath" class="fill-red-500/10" />
          <path
            :d="linePath"
            fill="none"
            class="stroke-red-500"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <!-- one strip per point: the whole strip answers hover and focus,
             not just the dot; a thin line marks the point -->
        <ul class="absolute inset-0 flex" :aria-label="name">
          <li
            v-for="(point, i) in placed"
            :key="point.key"
            class="point group relative h-full min-w-0 flex-1 rounded-[8px] outline-none"
            tabindex="0"
            :aria-label="`${point.title || point.label}: ${peso(point.total)}, ${salesText(point.count)}`"
          >
            <div class="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-white/20 group-hover:block group-focus-visible:block"></div>

            <div
              class="dot absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-red-500 ring-2 ring-zinc-900"
              :class="showDots ? '' : 'hidden group-hover:block group-focus-visible:block'"
              :style="{ bottom: `${point.pct}%` }"
            ></div>

            <div
              class="tip pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-[10px] bg-black px-2.5 py-1.5 text-xs shadow-xl ring-1 ring-white/10 group-hover:block group-focus-visible:block"
              :class="tipSide(i)"
              :style="{ bottom: `calc(${point.pct}% + 14px)` }"
              aria-hidden="true"
            >
              <p class="font-bold text-white">{{ peso(point.total) }}</p>
              <p class="text-zinc-400">{{ point.title || point.label }} · {{ salesText(point.count) }}</p>
            </div>
          </li>
        </ul>

        <p
          v-if="noSales"
          class="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-zinc-500"
        >
          {{ emptyText }}
        </p>
      </div>
    </div>

    <!-- labels under the points; "now" stands out. A label wider than its
         strip spills evenly into the space beside it. -->
    <div class="mt-2 flex pl-14 text-[11px]" aria-hidden="true">
      <span
        v-for="(point, i) in placed"
        :key="point.key"
        class="flex min-w-0 flex-1 justify-center whitespace-nowrap"
        :class="point.current ? 'font-bold text-white' : 'text-zinc-500'"
      >
        {{ showLabel(point, i) ? point.label : '' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* keyboard focus: a soft outline around the point's strip */
.point:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(244, 52, 76, 0.5);
}
</style>
