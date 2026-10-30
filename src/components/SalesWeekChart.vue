<script setup>
// Dashboard: sales of the last 7 days, one column per day, today on the
// right. Hover a column (or Tab to it) for that day's total and number of
// sales; screen readers hear the same. Every sale is listed on the Sales
// History page.
//
//   <SalesWeekChart :days="days" />
//   days: [{ key, short: 'Mon' | 'Today', long: 'Monday, Oct 27', total, count, isToday }]
import { computed } from 'vue'
import { count, niceTop, peso, pesoShort } from '../lib/format'

const props = defineProps({
  days: { type: Array, required: true },
})

const top = computed(() => niceTop(Math.max(0, ...props.days.map((day) => day.total))))

// top, middle and bottom line of the scale
const lines = computed(() => [top.value, top.value / 2, 0])

const noSales = computed(() => props.days.every((day) => day.total === 0))

function barHeight(day) {
  return `${(day.total / top.value) * 100}%`
}

function salesText(n) {
  return `${count(n)} sale${n === 1 ? '' : 's'}`
}
</script>

<template>
  <!-- at least 11rem tall; taller when the card around it is (the
       Dashboard stretches it to the height of the card next to it) -->
  <div class="flex flex-col">
    <div class="flex min-h-44 flex-1 gap-2">
      <!-- the scale: three clean amounts, with faint lines across the chart -->
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

        <!-- one column per day: the whole column answers hover and focus,
             not just the bar, so a short bar is easy to point at -->
        <ul class="absolute inset-0 flex" :aria-label="`Sales of the last ${days.length} days`">
          <li
            v-for="(day, i) in days"
            :key="day.key"
            class="day group relative flex h-full flex-1 items-end justify-center rounded-[8px] outline-none"
            tabindex="0"
            :aria-label="`${day.long}: ${peso(day.total)}, ${salesText(day.count)}`"
          >
            <div
              v-if="day.total > 0"
              class="bar w-[min(24px,60%)] rounded-t-[4px] bg-red-600 transition-colors group-hover:bg-red-500 group-focus-visible:bg-red-500"
              :style="{ height: barHeight(day) }"
            ></div>
            <!-- a day without sales: a short grey mark on the baseline -->
            <div v-else class="h-[2px] w-[min(24px,60%)] rounded-full bg-zinc-500"></div>

            <!-- the day's numbers above its column (the first and last
                 columns keep theirs inside the card) -->
            <div
              class="tip pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-[10px] bg-black px-2.5 py-1.5 text-xs shadow-xl ring-1 ring-white/10 group-hover:block group-focus-visible:block"
              :class="i === 0 ? 'left-0' : i === days.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'"
              :style="{ bottom: `calc(${day.total > 0 ? barHeight(day) : '0%'} + 8px)` }"
              aria-hidden="true"
            >
              <p class="font-bold text-white">{{ peso(day.total) }}</p>
              <p class="text-zinc-400">{{ day.long }} · {{ salesText(day.count) }}</p>
            </div>
          </li>
        </ul>

        <p
          v-if="noSales"
          class="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-zinc-500"
        >
          No sales in the last {{ days.length }} days.
        </p>
      </div>
    </div>

    <!-- day names under the columns; today stands out. A name wider than
         its column (Today, on a phone) spills evenly into the space beside it. -->
    <div class="mt-2 flex pl-14 text-[11px]" aria-hidden="true">
      <span
        v-for="day in days"
        :key="day.key"
        class="flex min-w-0 flex-1 justify-center whitespace-nowrap"
        :class="day.isToday ? 'font-bold text-white' : 'text-zinc-500'"
      >
        {{ day.short }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* keyboard focus: a soft outline around the day */
.day:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(244, 52, 76, 0.5);
}
</style>
