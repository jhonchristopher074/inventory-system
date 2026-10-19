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
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>

      <!-- a sound was blocked: any click on the page turns sound back on -->
      <span
        v-if="soundBlocked"
        class="absolute -bottom-1 -right-1 rounded-full bg-zinc-800 px-[3px] text-[9px] leading-4"
        title="Sound is off until you click or tap the page"
      >
        🔇
      </span>
    </button>

    <div
      v-if="showList"
      class="absolute right-0 z-[9999] mt-3 w-[min(24rem,calc(100vw_-_5.5rem))] rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl"
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
import { supabase, uniqueChannelName } from '../lib/supabase'

const router = useRouter()

const notifications = ref([])
const showList = ref(false)
const loading = ref(false)
const role = ref('')

let channel = null

// The real number of unread notifications. Counting the loaded list instead
// (only the 10 newest) stuck the badge at 10.
const unreadTotal = ref(null)

const unreadCount = computed(() =>
  unreadTotal.value ?? notifications.value.filter((notif) => !notif.is_read).length
)

async function fetchUnreadCount() {
  const { data, error } = await supabase.rpc('unread_notification_count')
  unreadTotal.value = error ? null : Number(data || 0)
}

function toggleList() {
  showList.value = !showList.value
}

async function fetchRole() {
  const { data } = await supabase.rpc('get_my_role')
  role.value = data || ''
}

// a notification is ours when it targets our role, or nobody in particular
function isForMe(notif) {
  return !notif.recipient_role || notif.recipient_role === role.value
}

async function fetchNotifications() {
  loading.value = true

  const { data, error } = await supabase.rpc('list_notifications', {
    p_limit: 10,
  })

  if (!error) {
    notifications.value = data || []
  }

  await fetchUnreadCount()

  loading.value = false
}

// Created on the first click or notification, not on every page load:
// loading it up front downloaded the sound on every visit (and showed a
// console error in Chrome with DevTools' "Disable cache") even when nothing
// arrived.
let audio = null

// Browsers refuse to play sound until the page has been clicked or tapped
// once (after every refresh). Phones (iOS especially) also want the sound
// itself started from a tap. So on the first tap/key, play it silently
// once: after that, notifications can play it whenever they arrive.
// soundBlocked shows a hint on the bell when a sound was refused.
const soundBlocked = ref(false)
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend']

function getAudio() {
  if (!audio) audio = new Audio('/notif.mp3')
  return audio
}

function unlockSound() {
  UNLOCK_EVENTS.forEach((name) => window.removeEventListener(name, unlockSound, true))

  const sound = getAudio()
  sound.muted = true
  sound
    .play()
    .then(() => {
      sound.pause()
      sound.currentTime = 0
      soundBlocked.value = false
    })
    .catch(() => {})
    .finally(() => {
      sound.muted = false
    })
}

function playSound() {
  const sound = getAudio()
  sound.muted = false
  sound.currentTime = 0
  sound.play().then(
    () => (soundBlocked.value = false),
    () => (soundBlocked.value = true)
  )
}

// Realtime only hears inserts while it's connected. A sleeping tab, a
// locked phone or a dropped connection misses them: they then showed up
// later in the list without any sound. So whenever the page comes back or
// realtime reconnects, reload the list and beep if there are more unread
// than before.
async function refreshAndAlert() {
  const before = unreadTotal.value
  await fetchNotifications()
  if (before !== null && unreadTotal.value !== null && unreadTotal.value > before) playSound()
}

function onVisible() {
  if (document.visibilityState === 'visible') refreshAndAlert()
}

let subscribedBefore = false

function setupRealtime() {
  channel = supabase
    .channel(uniqueChannelName('notifications'))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
      },
      (payload) => {
        // realtime delivers every insert, so filter here the same way
        // list_notifications does on the server
        if (!isForMe(payload.new)) return
        if (notifications.value.some((notif) => notif.id === payload.new.id)) return

        notifications.value.unshift(payload.new)
        if (unreadTotal.value !== null) unreadTotal.value += 1

        playSound()
      }
    )
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      // the first time is the normal start; later ones are reconnects
      if (subscribedBefore) refreshAndAlert()
      subscribedBefore = true
    })
}

function cleanupRealtime() {
  if (channel) {
    supabase.removeChannel(channel)
  }
}

async function openNotification(notif) {
  await supabase.rpc('mark_notification_read', {
    p_notification_id: notif.id,
  })

  await fetchNotifications()
  showList.value = false

  router.push(destinationFor(notif.type))
}

async function markAllAsRead() {
  await supabase.rpc('mark_all_notifications_read')

  await fetchNotifications()
}

// Each role has its own routes — sending staff to /inventory (admin only)
// just bounced them back via the router guard.
const ROUTES = {
  admin: {
    low_stock: '/inventory',
    restore: '/inventory',
    archive: '/archived',
    inspection: '/calendar',
    inspection_approval: '/approval',
    supplier_upload: '/approval',
    report: '/documentation',
    documentation: '/documentation',
    overdue: '/calendar',
    return: '/calendar',
    sale: '/admin/sales',
    default: '/',
  },
  staff: {
    inspection: '/staff/calendar',
    overdue: '/staff/calendar',
    return: '/staff/calendar',
    documentation: '/staff/documentation',
    report: '/staff/documentation',
    low_stock: '/staff/inventory',
    restore: '/staff/inventory',
    default: '/staff',
  },
  cashier: {
    sale: '/cashier/sales',
    default: '/cashier',
  },
  supplier: {
    default: '/SupplierDropBoxView',
  },
}

function destinationFor(type) {
  const map = ROUTES[role.value] || ROUTES.staff
  return map[type] || map.default
}

// sale, report, overdue and inspection_approval had no colour and fell
// through to plain grey, even though three of them are things an admin
// needs to act on
const BADGES = {
  low_stock: 'bg-yellow-500/20 text-yellow-400',
  overdue: 'bg-red-600/25 text-red-300',
  report: 'bg-red-500/20 text-red-400',
  return: 'bg-red-500/20 text-red-400',
  inspection_approval: 'bg-yellow-500/20 text-yellow-400',
  supplier_upload: 'bg-sky-500/20 text-sky-300',
  inspection: 'bg-zinc-700/50 text-zinc-300',
  sale: 'bg-emerald-500/20 text-emerald-400',
  documentation: 'bg-emerald-500/20 text-emerald-400',
  restore: 'bg-emerald-500/20 text-emerald-400',
  archive: 'bg-zinc-500/20 text-zinc-300',
}

function badgeClass(type) {
  return BADGES[type] || 'bg-zinc-700 text-zinc-300'
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleString()
}

// set when the bell goes away (e.g. logout) while still loading, so the
// realtime channel isn't opened afterwards and left running
let unmounted = false

onMounted(async () => {
  UNLOCK_EVENTS.forEach((name) => window.addEventListener(name, unlockSound, true))
  document.addEventListener('visibilitychange', onVisible)

  await fetchRole()
  await fetchNotifications()
  if (!unmounted) setupRealtime()
})

onUnmounted(() => {
  unmounted = true
  UNLOCK_EVENTS.forEach((name) => window.removeEventListener(name, unlockSound, true))
  document.removeEventListener('visibilitychange', onVisible)
  cleanupRealtime()
})
</script>