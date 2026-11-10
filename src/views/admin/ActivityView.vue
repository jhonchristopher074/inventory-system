<template>
  <div>
    <PageHeader title="Activity Log">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-bold text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-50"
        :disabled="exporting || filtered.length === 0"
        @click="exportExcel"
      >
        <NavIcon name="download" class="h-4 w-4" />
        {{ exporting ? 'Exporting…' : 'Export Excel' }}
      </button>
    </PageHeader>

    <div class="mb-5 card p-4">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px_170px_170px_auto]">
        <input
          v-model="search"
          type="search"
          maxlength="80"
          placeholder="Search item or change..."
          class="input"
        />

        <select v-model="period" class="input" aria-label="Period">
          <option v-for="p in PERIODS" :key="p.key" :value="p.key">{{ p.label }}</option>
        </select>

        <select v-model="who" class="input" aria-label="Person">
          <option value="">Everyone</option>
          <option v-for="name in people" :key="name" :value="name">{{ name }}</option>
        </select>

        <select v-model="type" class="input" aria-label="Type">
          <option value="">All types</option>
          <option v-for="t in types" :key="t" :value="t">{{ entityLabel(t) }}</option>
        </select>
        <span id="activity-rows" class="contents"></span>
      </div>
    </div>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
      {{ errorMessage }}
    </p>

    <div ref="tableTop" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="data-table resp-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Item</th>
              <th>Details</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="row in visible" :key="row.id">
              <td data-label="When" class="whitespace-nowrap text-xs text-zinc-400" :title="fullTime(row.created_at)">
                {{ dayAndTime(row.created_at) }}
              </td>

              <td data-label="Who">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm font-semibold text-white">{{ row.actor_name || 'System' }}</span>
                  <span
                    v-if="row.actor_role"
                    class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1"
                    :class="ROLE_CHIPS[row.actor_role] || ROLE_CHIPS.system"
                  >
                    {{ roleLabel(row.actor_role) }}
                  </span>
                </div>
              </td>

              <td data-label="Action">
                <span
                  class="inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold ring-1"
                  :class="ACTION_CHIPS[row.view.tone]"
                >
                  {{ row.view.verb }}
                </span>
              </td>

              <td class="cell-main">
                <p class="max-w-[16rem] truncate font-bold text-white" :title="row.view.item">{{ row.view.item }}</p>
                <p class="text-[11px] text-zinc-500">{{ entityLabel(row.entity) }}</p>
              </td>

              <td data-label="Details" class="text-xs text-zinc-300">
                <ul v-if="row.view.changes.length" class="space-y-0.5">
                  <li v-for="(line, i) in row.view.changes" :key="i" class="break-words">{{ line }}</li>
                </ul>
                <span v-else class="text-zinc-600">—</span>
              </td>
            </tr>

            <tr v-if="filtered.length === 0">
              <td colspan="5" class="cell-main p-6 text-center text-zinc-500">
                {{ loading ? 'Loading activity...' : 'No activity for this filter.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePager
        v-if="filtered.length > 0"
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filtered.length"
        noun="entries"
          rows-to="#activity-rows"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import { usePagination } from '../../lib/usePagination'
import { useQueryParam } from '../../lib/useQueryParam'
import { onLiveRefresh } from '../../lib/liveRefresh'
import { describeActivity, entityLabel } from '../../lib/activity'
import { downloadActivity } from '../../lib/backup'
import { currentUser } from '../../lib/currentUser'
import { dayAndTime } from '../../lib/format'
import { roleLabel } from '../../lib/roles'
import { toast } from '../../lib/toast'
import PageHeader from '../../components/PageHeader.vue'
import NavIcon from '../../components/NavIcon.vue'
import TablePager from '../../components/TablePager.vue'

const PERIODS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

const ROLE_CHIPS = {
  admin: 'bg-red-500/15 text-red-300 ring-red-500/30',
  manager: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  staff: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  cashier: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  supplier: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  system: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
}

const ACTION_CHIPS = {
  green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  red: 'bg-red-500/15 text-red-300 ring-red-500/30',
  blue: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  zinc: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
}

const rows = ref([])
const loading = ref(false)
const errorMessage = ref('')
const exporting = ref(false)
const tableTop = ref(null)

// kept in the address, so a refresh or a shared link shows the same view
const period = useQueryParam('period', '30d', PERIODS.map((p) => p.key))
const who = useQueryParam('who', '')
const type = useQueryParam('type', '')
const search = ref('')

function since(key) {
  const p = PERIODS.find((x) => x.key === key)
  if (!p || key === 'all') return null
  const now = new Date()
  if (key === 'year') return new Date(now.getFullYear(), 0, 1)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - (p.days ? p.days - 1 : 0))
  return start
}

async function load() {
  loading.value = true
  const from = since(period.value)
  const { data, error } = await supabase.rpc('admin_list_activity', {
    p_from: from ? from.toISOString() : null,
  })
  loading.value = false

  if (error) {
    errorMessage.value = /admin_list_activity|schema cache/i.test(error.message)
      ? 'The activity log needs an update: run 20261116000001_activity_log_and_backup.sql in Supabase.'
      : `Couldn't load the activity log: ${error.message}`
    return
  }
  errorMessage.value = ''
  rows.value = (data || []).map((row) => ({ ...row, view: describeActivity(row) }))
}

const people = computed(() => [...new Set(rows.value.map((r) => r.actor_name || 'System'))].sort())
const types = computed(() => [...new Set(rows.value.map((r) => r.entity))].sort())

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    if (who.value && (row.actor_name || 'System') !== who.value) return false
    if (type.value && row.entity !== type.value) return false
    if (!q) return true
    return [row.view.item, row.view.verb, ...row.view.changes, row.actor_name]
      .some((s) => String(s || '').toLowerCase().includes(q))
  })
})

const { page, pageSize, visible, reset } = usePagination(filtered, { storageKey: 'activity', scrollTarget: tableTop })

watch([who, type, search], reset)
watch(period, () => {
  reset()
  load()
})

function fullTime(value) {
  return new Date(value).toLocaleString()
}

async function exportExcel() {
  exporting.value = true
  try {
    const label = PERIODS.find((p) => p.key === period.value)?.label || 'All time'
    await downloadActivity(filtered.value, { madeBy: currentUser.value?.full_name || '', period: label })
  } catch (error) {
    toast(`Couldn't export: ${error.message}`, { kind: 'error' })
  } finally {
    exporting.value = false
  }
}

onMounted(load)
onLiveRefresh(load)
</script>
