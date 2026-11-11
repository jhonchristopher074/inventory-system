<template>
  <div ref="root" class="relative">
    <button
      class="bell-btn relative flex h-[3.8rem] w-[3.8rem] items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-white transition hover:bg-zinc-800"
      :class="unreadCount > 0 ? 'text-white' : 'text-zinc-300'"
      :aria-label="unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'"
      @click="toggleList"
    >
      <NavIcon name="bell" class="h-6 w-6" />

      <!-- unread: the count -->
      <span
        v-if="unreadCount > 0"
        class="absolute -right-1.5 -top-1.5 min-w-[1.35rem] rounded-full bg-red-600 px-1.5 py-[2px] text-center text-[11px] font-bold leading-none text-white"
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
      class="notif-panel absolute right-0 z-[9999] mt-2 w-[min(20rem,calc(100vw_-_5.5rem))]"
      role="dialog"
      aria-label="Notifications"
    >
      <header class="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-extrabold text-white">Notifications</h2>
          <span v-if="unreadCount > 0" class="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
            {{ unreadCount > 99 ? '99+' : unreadCount }} new
          </span>
        </div>

        <button
          type="button"
          class="rounded-lg px-2 py-1 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
          :disabled="unreadCount === 0"
          @click.stop="markAllAsRead"
        >
          Mark all read
        </button>
      </header>

      <p v-if="loading && notifications.length === 0" class="px-4 py-6 text-center text-sm text-zinc-400">Loading…</p>

      <!-- nothing yet -->
      <div v-else-if="notifications.length === 0 && myNotices.length === 0" class="px-4 py-10 text-center">
        <span class="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white/5 text-zinc-500">
          <NavIcon name="bell" class="h-5 w-5" />
        </span>
        <p class="mt-3 text-sm font-bold text-zinc-300">You're all caught up</p>
        <p class="text-xs text-zinc-500">New notifications show up here.</p>
      </div>

      <ul v-else class="notif-list max-h-[20rem] overflow-y-auto p-1.5">
        <!-- suppliers: the owner confirmed a receipt (lib/supplierNotices.js;
             gone after logout) -->
        <li v-for="notice in myNotices" :key="notice.id">
          <button type="button" class="notif-item" :class="{ 'is-unread': !notice.read }" @click="openNotice(notice)">
            <span class="notif-icon bg-emerald-500/20 text-emerald-400">
              <NavIcon name="check" class="h-3.5 w-3.5" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline justify-between gap-2">
                <span class="notif-title">Receipt confirmed</span>
                <span class="notif-time">{{ timeText(notice.confirmedAt) }}</span>
              </span>
              <span class="notif-text">{{ noticeText(notice) }}</span>
            </span>
            <i v-if="!notice.read" class="notif-dot" aria-label="Unread"></i>
          </button>
        </li>

        <li v-for="notif in notifications" :key="notif.id">
          <button type="button" class="notif-item" :class="{ 'is-unread': !notif.is_read }" @click="openNotification(notif)">
            <span class="notif-icon" :class="badgeClass(notif.type)">
              <NavIcon :name="iconFor(notif.type)" class="h-3.5 w-3.5" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-baseline justify-between gap-2">
                <span class="notif-title">{{ notif.title }}</span>
                <span class="notif-time">{{ timeText(notif.created_at) }}</span>
              </span>
              <span class="notif-text" :title="typeLabel(notif.type)">{{ notif.message }}</span>
            </span>
            <i v-if="!notif.is_read" class="notif-dot" aria-label="Unread"></i>
          </button>
        </li>
      </ul>
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
/* the list that opens under the bell */
.notif-panel {
  overflow: hidden;
  border-radius: 1.1rem;
  border: 1px solid var(--hairline);
  background: var(--surface);
  box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.75);
}

.notif-list {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.notif-item {
  position: relative;
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 0.55rem;
  border-radius: 0.65rem;
  padding: 0.45rem 0.55rem;
  text-align: left;
  transition: background-color 0.15s;
}

.notif-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.notif-item.is-unread {
  /* room for the red dot on the right */
  padding-right: 1.5rem;
  background: rgba(224, 27, 50, 0.07);
}

.notif-item.is-unread:hover {
  background: rgba(224, 27, 50, 0.12);
}

.notif-icon {
  display: grid;
  width: 1.6rem;
  height: 1.6rem;
  flex: none;
  place-items: center;
  border-radius: 0.55rem;
}

.notif-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-zinc-300);
}

.notif-item.is-unread .notif-title {
  color: #fff;
}

.notif-time {
  flex: none;
  font-size: 0.62rem;
  color: var(--color-zinc-500);
}

.notif-text {
  display: -webkit-box;
  margin-top: 0.05rem;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--color-zinc-400);
}

/* unread: a red dot on the right */
.notif-dot {
  position: absolute;
  top: 1rem;
  right: 0.6rem;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--brand-bright);
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
import { appUrl } from '../lib/appUrl'
import { dayAndTime } from '../lib/format'
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
  if (!audio) audio = new Audio(appUrl('notif.mp3'))
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

// "Today, 2:35 PM", "Yesterday, 9:05 AM", "Oct 27, 4:10 PM"
function timeText(date) {
  return date ? dayAndTime(date) : ''
}

// "low_stock" → "Low stock"
function typeLabel(type) {
  const text = String(type || 'notice').replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// each kind of notification's picture
const ICONS = {
  low_stock: 'alert',
  overdue: 'alert',
  report: 'flag',
  return: 'restore',
  inspection_approval: 'approval',
  supplier_upload: 'upload',
  inspection: 'calendar',
  sale: 'sales',
  documentation: 'docs',
  restore: 'restore',
  archive: 'archive',
  disabled: 'lock',
  receive: 'inventory',
  received: 'check',
  refund: 'tag',
  receipt: 'docs',
  delivery_receipt: 'docs',
}

function iconFor(type) {
  return ICONS[type] || 'bell'
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