<template>
  <!-- PHONES ONLY: the menu as a bar at the bottom of the screen, like
       Facebook's app (an alpha tester's suggestion: the sidebar stays hidden
       until it's opened). The main pages are one tap away; Menu opens every
       page, the account and Logout. Tablets and computers keep the sidebar
       (style.css hides one or the other). -->
  <nav v-if="tabs.length" class="tabbar" :class="{ 'menu-open': menuOpen }" aria-label="Main menu">
    <RouterLink
      v-for="item in tabs"
      :key="item.to"
      :to="item.to"
      class="tab"
      active-class="is-current"
      :aria-label="labelOf(item)"
      @click="closeMenu"
    >
      <span class="tab-ico">
        <NavIcon :name="item.icon" />
        <!-- what's waiting there (lib/taskCounts.js), as on the sidebar -->
        <span v-if="badgeOf(item.to)" class="tab-badge" :class="`is-${badgeOf(item.to).tone}`" aria-hidden="true">
          {{ shortCount(badgeOf(item.to).n) }}
        </span>
      </span>
      <span class="tab-label">{{ item.short || item.label }}</span>
    </RouterLink>

    <!-- Menu: the current one while it's open, or when the page open now
         is one of the pages under it -->
    <button
      ref="menuButton"
      type="button"
      class="tab tab-menu"
      :class="{ 'is-current': menuOpen || !onTab }"
      :aria-expanded="menuOpen"
      aria-controls="phone-menu"
      :aria-label="menuWaiting ? 'Menu: something is waiting on a page in it' : 'Menu'"
      @click="toggleMenu"
    >
      <span class="tab-ico">
        <NavIcon name="menu" />
        <span v-if="menuWaiting" class="tab-dot" :class="`is-${menuWaiting}`" aria-hidden="true"></span>
      </span>
      <span class="tab-label">Menu</span>
    </button>
  </nav>

  <!-- MENU: every page of the role, who is logged in, and Logout. Above
       the page, under the bar (its Menu button closes it again). -->
  <Transition name="phone-menu">
    <div
      v-if="menuOpen"
      id="phone-menu"
      class="phone-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-menu-title"
    >
      <header class="menu-head">
        <h2 id="phone-menu-title" class="menu-title">Menu</h2>
        <button ref="closeButton" type="button" class="menu-close" aria-label="Close the menu" @click="closeMenu(true)">
          ✕
        </button>
      </header>

      <!-- who is logged in: opens their profile -->
      <div class="menu-me" @click="closeMenu">
        <CurrentUserBadge :role="role" :name="name" :email="email" :to="profileLink" />
      </div>

      <section v-for="group in groups" :key="group.section">
        <h3 class="menu-section">{{ group.section }}</h3>

        <div class="menu-grid">
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="menu-card"
            active-class="is-current"
            :aria-label="labelOf(item)"
            @click="closeMenu"
          >
            <span class="menu-card-ico"><NavIcon :name="item.icon" /></span>
            <span class="menu-card-label">{{ item.label }}</span>
            <span v-if="badgeOf(item.to)?.hint" class="menu-card-hint" :class="`is-${badgeOf(item.to).tone}`">
              {{ badgeOf(item.to).hint }}
            </span>
            <span v-if="badgeOf(item.to)" class="menu-card-badge" :class="`is-${badgeOf(item.to).tone}`" aria-hidden="true">
              {{ shortCount(badgeOf(item.to).n) }}
            </span>
          </RouterLink>
        </div>
      </section>

      <!-- asks first (App.vue), like the sidebar's -->
      <button type="button" class="menu-logout" @click="emit('logout')">
        <NavIcon name="logout" class="h-5 w-5" />
        Logout
      </button>

      <p class="menu-foot">10 FIVE 7 Hardware · Inventory Management System</p>
    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import NavIcon from './NavIcon.vue'
import CurrentUserBadge from './CurrentUserBadge.vue'
import { taskBadges } from '../lib/taskCounts'

const props = defineProps({
  // the role's menu (App.vue): [{ section, items: [{ to, label, icon, bar?, short? }] }]
  groups: { type: Array, default: () => [] },
  role: { type: String, default: '' },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  // the person's own Profile page
  profileLink: { type: String, default: '/' },
})

const emit = defineEmits(['logout'])
const route = useRoute()

const items = computed(() => props.groups.flatMap((group) => group.items))

// the pages on the bar (bar: true in App.vue), in the menu's order
const tabs = computed(() => items.value.filter((item) => item.bar))

// what's waiting on a page (lib/taskCounts.js): the sidebar's numbers
function badgeOf(path) {
  const badge = taskBadges.byPath[path]
  return badge && badge.n > 0 ? badge : null
}

function shortCount(n) {
  return n > 99 ? '99+' : n
}

// read out with what's waiting: "Approval: 4 receipts to approve"
function labelOf(item) {
  const badge = badgeOf(item.to)
  return badge?.hint ? `${item.label}: ${badge.hint}` : item.label
}

// the page open now has its own tab (else it's one of Menu's pages)
const onTab = computed(() => tabs.value.some((item) => item.to === route.path))

// something waiting on a page that's only under Menu: a dot on Menu,
// red for a task, else orange for an alert (stock running low)
const menuWaiting = computed(() => {
  const waiting = items.value
    .filter((item) => !item.bar)
    .map((item) => badgeOf(item.to))
    .filter(Boolean)
  if (waiting.some((badge) => badge.tone === 'task')) return 'task'
  return waiting.length > 0 ? 'alert' : ''
})

/* ------------------------------------------------------------------
   The Menu
------------------------------------------------------------------ */
const menuOpen = ref(false)
const menuButton = ref(null)
const closeButton = ref(null)

async function openMenu() {
  menuOpen.value = true
  await nextTick()
  closeButton.value?.focus()
}

// back = true (✕, Esc, Menu again): the focus goes back to the Menu button.
// A link's click passes its event instead, and the new page takes the focus.
function closeMenu(back) {
  if (!menuOpen.value) return
  menuOpen.value = false
  if (back === true) menuButton.value?.focus()
}

function toggleMenu() {
  if (menuOpen.value) closeMenu(true)
  else openMenu()
}

function onKey(event) {
  if (event.key === 'Escape' && menuOpen.value) closeMenu(true)
}

// another page (a link, a notification, Back): the Menu closes
watch(
  () => route.fullPath,
  () => closeMenu()
)

// the page under the open Menu stays still (style.css: html.phone-menu-open)
watch(menuOpen, (open) => {
  document.documentElement.classList.toggle('phone-menu-open', open)
})

// a phone turned sideways or a window made wider: the sidebar is back, the
// Menu closes
const phoneWidth = window.matchMedia('(max-width: 760px)')

function onWidth(event) {
  if (!event.matches) closeMenu()
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  phoneWidth.addEventListener('change', onWidth)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  phoneWidth.removeEventListener('change', onWidth)
  document.documentElement.classList.remove('phone-menu-open')
})
</script>

<style scoped>
/* ------------------------------------------------------------------
   The bar. Layers (style.css): the page (POS cart bar: 40) < the bar (45)
   < popups (50 and up).
------------------------------------------------------------------ */
.tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 45;
  display: none;
  height: var(--tabbar-space);
  padding: 0 0.3rem env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--hairline);
  /* solid, the sidebar's colour: see-through, the page's text showed
     behind the names */
  background: #15171b;
  box-shadow: 0 -14px 30px -20px rgba(0, 0, 0, 0.95);
}

@media (max-width: 760px) {
  .tabbar {
    display: flex;
  }
}

.tab {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.3rem 0.1rem 0.25rem;
  color: #9a9aa8;
  -webkit-tap-highlight-color: transparent;
}

.tab-ico {
  position: relative;
  display: grid;
  width: 3.1rem;
  height: 1.95rem;
  place-items: center;
  border-radius: 999px;
  transition:
    background-color 0.18s var(--ease),
    color 0.18s var(--ease);
}

.tab-ico svg {
  width: 1.45rem;
  height: 1.45rem;
}

.tab-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.15;
}

/* the page open now (or Menu, while it's open): red, with a line on top
   like the sidebar's red rail */
.tab.is-current {
  color: #fff;
}

.tab.is-current .tab-ico {
  background: var(--brand-dim);
  color: var(--brand-bright);
}

.tab.is-current::before {
  content: '';
  position: absolute;
  top: -1px;
  right: 26%;
  left: 26%;
  height: 3px;
  border-radius: 0 0 4px 4px;
  background: var(--brand-bright);
  box-shadow: 0 0 10px rgba(244, 52, 76, 0.6);
}

/* the Menu is open: the page's own tab steps back */
.tabbar.menu-open .tab:not(.tab-menu).is-current {
  color: #9a9aa8;
}

.tabbar.menu-open .tab:not(.tab-menu).is-current .tab-ico {
  background: transparent;
  color: inherit;
}

.tabbar.menu-open .tab:not(.tab-menu).is-current::before {
  display: none;
}

/* a number on the icon's corner: red = tasks, orange = an alert */
.tab-badge {
  position: absolute;
  top: -0.3rem;
  left: calc(50% + 0.3rem);
  display: grid;
  min-width: 1.15rem;
  height: 1.15rem;
  place-items: center;
  border-radius: 999px;
  padding: 0 0.28rem;
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 0 0 2px #15171b;
}

/* Menu: a dot, something is waiting on one of its pages */
.tab-dot {
  position: absolute;
  top: 0.05rem;
  left: calc(50% + 0.55rem);
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 999px;
  box-shadow: 0 0 0 2px #15171b;
}

.tab-badge.is-task,
.tab-dot.is-task,
.menu-card-badge.is-task {
  background: var(--brand-bright);
  color: #fff;
}

.tab-badge.is-alert,
.tab-dot.is-alert,
.menu-card-badge.is-alert {
  background: var(--alert);
  color: #1a1000;
}

/* ------------------------------------------------------------------
   The Menu: the whole screen above the bar
------------------------------------------------------------------ */
.phone-menu {
  position: fixed;
  top: 0;
  right: 0;
  bottom: var(--tabbar-space);
  left: 0;
  z-index: 44;
  overflow-y: auto;
  overscroll-behavior: contain;
  background:
    radial-gradient(120% 55% at 0% 0%, rgba(224, 27, 50, 0.13), transparent 62%),
    var(--color-black);
  padding: 1rem 0.95rem 1.5rem;
}

@media (min-width: 761px) {
  .phone-menu {
    display: none;
  }
}

.menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
}

.menu-title {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.1;
  color: #fff;
}

.menu-close {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: none;
  place-items: center;
  border-radius: 999px;
  background: var(--color-zinc-800);
  color: #fff;
}

.menu-close:hover {
  background: var(--color-zinc-700);
}

/* who is logged in: the whole width */
.menu-me :deep(.user-badge) {
  display: flex;
  width: 100%;
}

.menu-section {
  margin: 1.2rem 0 0.5rem;
  padding-left: 0.2rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6c6c79;
}

/* every page: two cards a row, like Facebook's shortcuts */
.menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.menu-card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 5.6rem;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.45rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: linear-gradient(180deg, var(--surface-raised), var(--surface));
  box-shadow: var(--shadow-card);
  padding: 0.75rem 0.8rem;
  color: #e6e6ec;
  -webkit-tap-highlight-color: transparent;
}

.menu-card:active {
  transform: scale(0.98);
}

.menu-card-ico {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: 0.7rem;
  background: rgba(255, 255, 255, 0.06);
  color: #d2d2db;
}

.menu-card-ico svg {
  width: 1.2rem;
  height: 1.2rem;
}

.menu-card-label {
  max-width: 100%;
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1.2;
}

/* what's waiting, in words: "4 receipts to approve" */
.menu-card-hint {
  margin-top: -0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.3;
}

.menu-card-hint.is-task {
  color: var(--color-red-400);
}

.menu-card-hint.is-alert {
  color: var(--alert);
}

.menu-card-badge {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  display: grid;
  min-width: 1.35rem;
  height: 1.35rem;
  place-items: center;
  border-radius: 999px;
  padding: 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 800;
  line-height: 1;
}

/* the page open now */
.menu-card.is-current {
  border-color: rgba(224, 27, 50, 0.45);
  background:
    linear-gradient(145deg, rgba(224, 27, 50, 0.2), rgba(255, 255, 255, 0.02) 60%),
    var(--surface);
}

.menu-card.is-current .menu-card-ico {
  background: var(--brand-dim);
  color: var(--brand-bright);
}

.menu-logout {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 1.4rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.85rem;
  font-weight: 800;
  color: #fff;
}

.menu-logout:hover,
.menu-logout:active {
  border-color: var(--brand);
  background: var(--brand);
}

.menu-foot {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.7rem;
  color: var(--color-zinc-500);
}

.phone-menu-enter-active,
.phone-menu-leave-active {
  transition:
    opacity 0.2s var(--ease),
    transform 0.2s var(--ease);
}

.phone-menu-enter-from,
.phone-menu-leave-to {
  opacity: 0;
  transform: translateY(14px);
}
</style>
