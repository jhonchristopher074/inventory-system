<template>
  <div class="relative">
    <button
      class="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-lg text-white transition hover:bg-zinc-800"
      @click="toggleList"
    >
      🔔

      <span
        v-if="unreadCount > 0"
        class="absolute -right-1 -top-1 rounded-full bg-red-600 px-[6px] py-[1px] text-[9px] font-bold text-white"
      >
        {{ unreadCount }}
      </span>
    </button>

    <div
      v-if="showList"
      class="absolute right-0 z-[9999] mt-3 w-96 rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl"
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-bold text-white">Notifications</h2>

        <button
          class="text-xs text-red-400 hover:text-red-300"
          @click.stop="markAllAsRead"
        >
          Mark all read
        </button>
      </div>

      <p v-if="loading" class="text-sm text-zinc-400">Loading...</p>

      <p v-if="notifications.length === 0 && !loading" class="text-sm text-zinc-500">
        No notifications.
      </p>

      <div class="max-h-96 space-y-2 overflow-y-auto">
        <div
          v-for="notif in notifications"
          :key="notif.id"
          class="cursor-pointer rounded-xl border border-white/10 p-3 transition hover:-translate-y-1 hover:border-red-500/40"
          :class="notif.is_read ? 'bg-zinc-900' : 'bg-red-600/10'"
          @click="openNotification(notif)"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <h3 class="text-sm font-bold text-white">{{ notif.title }}</h3>

            <span
              class="rounded-full px-2 py-[2px] text-[10px] font-bold"
              :class="badgeClass(notif.type)"
            >
              {{ notif.type }}
            </span>
          </div>

          <p class="text-xs text-zinc-400">{{ notif.message }}</p>

          <p class="mt-2 text-[10px] text-zinc-500">
            {{ formatDate(notif.created_at) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'

const router = useRouter()

const notifications = ref([])
const showList = ref(false)
const loading = ref(false)

let channel = null

const unreadCount = computed(() =>
  notifications.value.filter((notif) => !notif.is_read).length
)

function toggleList() {
  showList.value = !showList.value
}

async function fetchNotifications() {
  loading.value = true

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (!error) {
    notifications.value = data || []
  }

  loading.value = false
}

function setupRealtime() {
  const audio = new Audio('/notif.mp3')

  channel = supabase
    .channel('notifications-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      },
      (payload) => {
        notifications.value.unshift(payload.new)

        audio.currentTime = 0
        audio.play().catch(() => {})
      }
    )
    .subscribe()
}

function cleanupRealtime() {
  if (channel) {
    supabase.removeChannel(channel)
  }
}

async function openNotification(notif) {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notif.id)

  await fetchNotifications()
  showList.value = false

  if (notif.type === 'low_stock') router.push('/inventory')
  else if (notif.type === 'inspection') router.push('/calendar')
  else if (notif.type === 'return') router.push('/calendar')
  else if (notif.type === 'documentation') router.push('/documentation')
  else if (notif.type === 'archive') router.push('/archived')
  else if (notif.type === 'restore') router.push('/inventory')
  else router.push('/')
}

async function markAllAsRead() {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)

  await fetchNotifications()
}

function badgeClass(type) {
  if (type === 'low_stock') return 'bg-yellow-500/20 text-yellow-400'
  if (type === 'inspection') return 'bg-blue-500/20 text-blue-400'
  if (type === 'return') return 'bg-red-500/20 text-red-400'
  if (type === 'documentation') return 'bg-emerald-500/20 text-emerald-400'
  if (type === 'archive') return 'bg-zinc-500/20 text-zinc-300'
  if (type === 'restore') return 'bg-emerald-500/20 text-emerald-400'

  return 'bg-zinc-700 text-zinc-300'
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleString()
}

onMounted(() => {
  fetchNotifications()
  setupRealtime()
})

onUnmounted(() => {
  cleanupRealtime()
})
</script>