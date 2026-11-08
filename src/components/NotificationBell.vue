<template>
  <div ref="root" class="relative">
    <button
      class="relative flex h-[3.8rem] w-[3.8rem] items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-white transition hover:bg-zinc-800"
      :class="unreadCount > 0 ? 'text-white' : 'text-zinc-300'"
      :aria-label="unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'"
      @click="toggleList"
    >
      <NavIcon name="bell" class="h-6 w-6" />

      <!-- unread: the count, with a red ring pulsing out of it -->
      <span
        v-if="unreadCount > 0"
        class="unread-count absolute -right-1.5 -top-1.5 min-w-[1.35rem] rounded-full bg-red-600 px-1.5 py-[2px] text-center text-[11px] font-bold leading-none text-white"
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

      <p v-if="notifications.length === 0 && myNotices.length === 0 && !loading" class="text-sm text-zinc-500">
        No notifications.
      </p>

      <div class="max-h-96 space-y-2 overflow-y-auto">
        <!-- suppliers: the owner confirmed a receipt (lib/supplierNotices.js;
             gone after logout) -->
        <div
          v-for="notice in myNotices"
          :key="notice.id"
          class="cursor-pointer rounded-xl border border-white/10 p-3 transition hover:-translate-y-1 hover:border-emerald-500/40"
          :class="notice.read ? 'bg-zinc-900' : 'bg-emerald-600/10'"
          @click="openNotice(notice)"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <h3 class="text-sm font-bold text-white">Receipt confirmed</h3>
            <span class="rounded-full bg-emerald-500/20 px-2 py-[2px] text-[10px] font-bold text-emerald-400">added</span>
          </div>
          <p class="text-xs text-zinc-400">{{ noticeText(notice) }}</p>
          <p class="mt-2 text-[10px] text-zinc-500">{{ formatDate(notice.confirmedAt) }}</p>
        </div>

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

    <!-- POP-UP: a new confirmation for a supplier; hides itself -->
    <Teleport to="body">
      <Transition name="notice-pop">
        <div
          v-if="popup"
          class="fixed bottom-5 right-5 z-[2500] flex w-[min(22rem,calc(100vw-2.5rem))] items-start gap-3 rounded-2xl border border-emerald-500/40 bg-zinc-900 p-3.5 shadow-2xl"
          role="status"
        >
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-extrabold text-black" aria-hidden="true">✓</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold text-white">{{ popup.title }}</p>
            <p class="mt-0.5 text-xs text-zinc-400">{{ popup.text }}</p>
            <button type="button" class="mt-1.5 text-xs font-bold text-emerald-400 hover:text-white" @click="openPopup">
              See the products ›
            </button>
          </div>
          <button type="button" class="text-zinc-500 hover:text-white" aria-label="Close" @click="popup = null">✕</button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* the unread count: a red ring keeps pulsing out of it */
.unread-count::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 2px solid #e01b32;
  animation: unread-pulse 1.6s ease-out infinite;
  pointer-events: none;
}

@keyframes unread-pulse {
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
  .unread-count::after {
    animation: none;
    opacity: 0;
  }
}

.notice-pop-enter-active,
.notice-pop-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.notice-pop-enter-from,
.notice-pop-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import NavIcon from './NavIcon.vue'
import { refreshTasksSoon } from '../lib/taskCounts'
import { announceChange } from '../lib/liveRefresh'
import { useRoute, useRouter } from 'vue-router'
import { supabase, uniqueChannelName } from '../lib/supabase'
import {
  markAllNoticesRead,
  markNoticeRead,
  noticeText,
  supplierNotices,
  takeNewNotices,
} from '../lib/supplierNotices'

const router = useRouter()
const route = useRoute()

const notifications = ref([])
const showList = ref(false)
const loading = ref(false)
const role = ref('')

let channel = null

// The real number of unread notifications. Counting the loaded list instead
// (only the 10 newest) stuck the badge at 10.
const unreadTotal = ref(null)

// a supplier's confirmed receipts (only suppliers have them)
const myNotices = computed(() => (role.value === 'supplier' ? supplierNotices.value : []))

const unreadCount = computed(
  () =>
    (unreadTotal.value ?? notifications.value.filter((notif) => !notif.is_read).length) +
    myNotices.value.filter((notice) => !notice.read).length
)

/* ------------------------------------------------------------------
   Suppliers: "your receipt was confirmed" (lib/supplierNotices.js)
------------------------------------------------------------------ */
const popup = ref(null) // { title, text, uploadId }
let popupTimer = null

async function checkNotices() {
  if (role.value !== 'supplier') return

  const fresh = await takeNewNotices()
  if (fresh.length === 0) return

  const products = fresh.reduce((sum, notice) => sum + notice.products, 0)
  popup.value = {
    title: fresh.length === 1 ? 'Your receipt was confirmed' : `${fresh.length} receipts were confirmed`,
    text:
      fresh.length === 1
        ? noticeText(fresh[0])
        : `${products} products were added to the inventory.`,
    uploadId: fresh.length === 1 ? fresh[0].uploadId : null,
  }
  clearTimeout(popupTimer)
  popupTimer = setTimeout(() => (popup.value = null), 9000)
  playSound()
}

function noticeLink(uploadId) {
  return uploadId
    ? { path: '/SupplierDropBoxView', query: { tab: 'uploads', added: uploadId } }
    : { path: '/SupplierDropBoxView', query: { tab: 'uploads' } }
}

function openNotice(notice) {
  markNoticeRead(notice.id)
  showList.value = false
  router.push(noticeLink(notice.uploadId))
}

function openPopup() {
  const target = popup.value
  popup.value = null
  if (target?.uploadId) markNoticeRead(`added-${target.uploadId}`)
  router.push(noticeLink(target?.uploadId))
}

async function fetchUnreadCount() {
  const { data, error } = await supabase.rpc('unread_notification_count')
  unreadTotal.value = error ? null : Number(data || 0)
}

function toggleList() {
  showList.value = !showList.value
}

// The open list closes on a click or tap anywhere else, on Esc and on a
// page change. Before, it stayed open above popups opened after it,
// covering their buttons, while the bell to close it sat under the popup.
const root = ref(null)

function onPointerDownAnywhere(event) {
  if (showList.value && root.value && !root.value.contains(event.target)) showList.value = false
}

function onKeyAnywhere(event) {
  if (event.key === 'Escape') showList.value = false
}

watch(
  () => route.fullPath,
  () => {
    showList.value = false
  }
)

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
// Events browsers (iPhones especially) count as a real tap, which is what
// allows sound. pointerdown isn't one of them on iPhones.
const UNLOCK_EVENTS = ['click', 'touchend', 'keydown']
let unlocked = false
let unlocking = false

function listenForUnlock(on) {
  UNLOCK_EVENTS.forEach((name) =>
    on
      ? window.addEventListener(name, unlockSound, true)
      : window.removeEventListener(name, unlockSound, true)
  )
}

function getAudio() {
  if (!audio) audio = new Audio('/notif.mp3')
  return audio
}

// Keeps listening until playing really works: if a tap isn't accepted, the
// next one tries again. Before, it stopped listening after the first try,
// so when that failed (often on iPhones) the 🔇 hint's "tap the page" did
// nothing until the page was reloaded.
function unlockSound() {
  if (unlocked || unlocking) return
  unlocking = true

  const sound = getAudio()
  sound.muted = true
  sound
    .play()
    .then(() => {
      sound.pause()
      sound.currentTime = 0
      unlocked = true
      soundBlocked.value = false
      listenForUnlock(false)
    })
    .catch(() => {})
    .finally(() => {
      sound.muted = false
      unlocking = false
    })
}

function playSound() {
  const sound = getAudio()
  sound.muted = false
  sound.currentTime = 0
  sound.play().then(
    () => (soundBlocked.value = false),
    () => {
      // refused (e.g. the phone took the permission back): listen for the
      // next tap again
      soundBlocked.value = true
      unlocked = false
      listenForUnlock(true)
    }
  )
}

// Realtime only hears inserts while it's connected. A sleeping tab, a
// locked phone or a dropped connection misses them: they then showed up
// later in the list without any sound. So whenever the page comes back or
// realtime reconnects, reload the list and beep if there are more unread
// than before.
async function refreshAndAlert() {
  const before = unreadTotal.value
  checkNotices()
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
        // something new may be waiting: the menu's numbers follow
        refreshTasksSoon()
        // the open page reloads its lists (lib/liveRefresh.js)
        announceChange()

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
  markAllNoticesRead()
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
    // a product disabled at the POS: Inventory shows it, with Enable
    disabled: '/inventory',
    // a staff member received a supplier delivery (in stock): its details
    received: '/approval',
    // goods arrived without their receipt: Calendar > Delivery
    delivery_receipt: '/calendar?tab=delivery',
    // a cashier refunded a sale: Sales History > Refunds
    refund: '/admin/sales?view=refunds',
    inspection: '/calendar',
    // each opens its own tab of the Approval page
    inspection_approval: '/approval?tab=inspections',
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
    // a supplier delivery to receive (or cancelled)
    receive: '/staff/calendar?tab=delivery',
    // a receipt they uploaded was approved or denied
    receipt: '/staff/receipts',
    default: '/staff',
  },
  cashier: {
    sale: '/cashier/sales',
    // the owner approved or rejected a refund
    refund: '/cashier/sales',
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
  inspection_approval: 'bg-sky-500/20 text-sky-300',
  supplier_upload: 'bg-sky-500/20 text-sky-300',
  inspection: 'bg-zinc-700/50 text-zinc-300',
  sale: 'bg-emerald-500/20 text-emerald-400',
  documentation: 'bg-emerald-500/20 text-emerald-400',
  restore: 'bg-emerald-500/20 text-emerald-400',
  archive: 'bg-zinc-500/20 text-zinc-300',
  disabled: 'bg-red-600/25 text-red-300',
  receive: 'bg-violet-500/20 text-violet-300',
  received: 'bg-emerald-500/20 text-emerald-400',
  refund: 'bg-amber-500/20 text-amber-300',
  receipt: 'bg-sky-500/20 text-sky-300',
  delivery_receipt: 'bg-amber-500/20 text-amber-300',
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
  listenForUnlock(true)
  document.addEventListener('pointerdown', onPointerDownAnywhere)
  document.addEventListener('keydown', onKeyAnywhere)
  document.addEventListener('visibilitychange', onVisible)

  await fetchRole()
  await fetchNotifications()
  if (!unmounted) setupRealtime()
  if (!unmounted) checkNotices()
})

onUnmounted(() => {
  unmounted = true
  listenForUnlock(false)
  document.removeEventListener('pointerdown', onPointerDownAnywhere)
  document.removeEventListener('keydown', onKeyAnywhere)
  document.removeEventListener('visibilitychange', onVisible)
  cleanupRealtime()
  clearTimeout(popupTimer)
})
</script>