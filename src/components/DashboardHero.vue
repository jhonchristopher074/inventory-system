<template>
  <!-- The top of a dashboard. Each role has its own colour, icon and name
       for its dashboard (Owner: Store overview, Staff: Inspection desk,
       Cashier: Sales counter), so you can tell at a glance whose it is.
       Buttons put inside it sit on the right. -->
  <header class="hero" :class="`tone-${tone}`">
    <span class="hero-icon" aria-hidden="true">
      <NavIcon :name="icon" class="h-7 w-7" />
    </span>

    <div class="min-w-0 flex-1 basis-56">
      <p class="hero-eyebrow">{{ role }} · {{ place }}</p>
      <h1 class="hero-title">{{ greeting }}</h1>
      <p class="hero-sub">{{ dateText }} · {{ subtitle }}</p>
    </div>

    <div class="hero-actions">
      <slot />
    </div>
  </header>
</template>

<script setup>
import { readCurrentUser } from '../lib/currentUser'
import { computed } from 'vue'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  // red | green | amber | blue | violet (the tone-* classes in style.css)
  tone: { type: String, default: 'red' },
  icon: { type: String, default: 'dashboard' },
  role: { type: String, required: true },
  place: { type: String, required: true },
  subtitle: { type: String, default: '' },
  // the moment the dashboard's numbers are for
  now: { type: Date, required: true },
})

// the first name saved at login (LoginView), if there is one
const firstName = (() => {
  try {
    const user = readCurrentUser()
    return String(user.full_name || '').trim().split(/\s+/)[0] || ''
  } catch {
    return ''
  }
})()

const greeting = computed(() => {
  const hour = props.now.getHours()
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return firstName ? `${part}, ${firstName}` : part
})

const dateText = computed(() =>
  props.now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
)
</script>

<style scoped>
.hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem 1.25rem;
  margin-bottom: 1rem;
  border-radius: 26px;
  border: 1px solid color-mix(in srgb, var(--tone) 28%, transparent);
  background:
    radial-gradient(110% 160% at 0% 0%, color-mix(in srgb, var(--tone) 17%, transparent), transparent 55%),
    linear-gradient(180deg, var(--surface-raised), var(--surface));
  box-shadow: var(--shadow-card);
  padding: 1.1rem 1.25rem;
}

.hero-icon {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 1rem;
  background: color-mix(in srgb, var(--tone) 17%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone) 32%, transparent);
  color: var(--tone);
}

.hero-eyebrow {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--tone);
}

.hero-title {
  margin-top: 0.1rem;
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.15;
  color: #fff;
}

.hero-sub {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: var(--color-zinc-400);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
</style>
