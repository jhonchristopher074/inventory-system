<template>
  <!-- The Owner's backup (Profile page): every table in one Excel file.
       lib/backup.js, and supabase/migrations/20261116000001. -->
  <div class="card p-4">
    <div class="flex items-center gap-3">
      <span
        class="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
        :class="stale ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'"
      >
        <NavIcon name="download" class="h-5 w-5" />
      </span>

      <div class="min-w-0 flex-1">
        <p class="font-bold text-white">Backup</p>
        <p class="truncate text-xs" :class="stale ? 'text-amber-300' : 'text-zinc-500'" :title="lastTitle">
          {{ lastText }}
        </p>
        <p class="truncate text-xs text-zinc-500">Every table, one Excel file</p>
      </div>

      <button
        type="button"
        class="shrink-0 rounded-xl bg-red-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        :disabled="busy"
        @click="download"
      >
        {{ busy ? 'Saving…' : 'Download' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { downloadBackup } from '../lib/backup'
import { currentUser } from '../lib/currentUser'
import { count } from '../lib/format'
import { toast } from '../lib/toast'
import NavIcon from './NavIcon.vue'

// a backup older than this is flagged
const STALE_DAYS = 7

const busy = ref(false)
const last = ref(null) // { created_at, actor_name } of the newest backup
const loaded = ref(false)

const ageDays = computed(() =>
  last.value ? Math.floor((Date.now() - new Date(last.value.created_at)) / 86400000) : Infinity
)
const stale = computed(() => loaded.value && ageDays.value >= STALE_DAYS)

const lastText = computed(() => {
  if (!loaded.value) return 'Checking…'
  if (!last.value) return 'No backup yet'
  const ago = ageDays.value === 0 ? 'today' : ageDays.value === 1 ? 'yesterday' : `${ageDays.value} days ago`
  return `Last backup ${ago}`
})

const lastTitle = computed(() =>
  last.value
    ? `${new Date(last.value.created_at).toLocaleString()}${last.value.actor_name ? ` by ${last.value.actor_name}` : ''}`
    : ''
)

async function loadLast() {
  const { data } = await supabase.rpc('admin_list_activity', { p_entity: 'backup', p_limit: 1 })
  last.value = (Array.isArray(data) ? data : []).find((row) => row.entity === 'backup') || null
  loaded.value = true
}

async function download() {
  busy.value = true
  try {
    const rows = await downloadBackup(currentUser.value?.full_name || '')
    toast(`Backup saved: ${count(rows)} rows.`)
    await loadLast()
  } catch (error) {
    toast(error.message || "Couldn't make the backup.", { kind: 'error', ms: 8000 })
  } finally {
    busy.value = false
  }
}

onMounted(loadLast)
</script>
