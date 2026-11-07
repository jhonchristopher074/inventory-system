<template>
  <!-- Who is logged in, at the top of every page: a user panel like
       AdminLTE's. A rounded-square avatar in the role's colour, the name,
       and under it the role with a dot (green = this session is active).
       Top right, before the bell. Opens their profile. -->
  <RouterLink
    :to="to"
    class="user-badge"
    :class="`tone-${roleTone(role)}`"
    :title="`Logged in as ${displayName} (${roleLabel(role)}). Open your profile.`"
  >
    <span class="user-avatar" aria-hidden="true">{{ initials }}</span>

    <span class="user-text">
      <span class="user-name">{{ displayName }}</span>
      <span class="user-role">
        <span class="user-dot" aria-hidden="true"></span>
        {{ roleLabel(role) }}
        <span class="sr-only">, logged in</span>
      </span>
    </span>
  </RouterLink>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { roleLabel, roleTone } from '../lib/roles'

const props = defineProps({
  role: { type: String, default: '' },
  name: { type: String, default: '' },
  email: { type: String, default: '' },
  // the person's own profile page
  to: { type: String, default: '/' },
})

// the name; without one the email, without that the role
const displayName = computed(
  () => String(props.name || '').trim() || String(props.email || '').trim() || roleLabel(props.role)
)

// "Karl Velasco" -> KV, "Steve" -> ST
const initials = computed(() => {
  const words = displayName.value.split(/[\s@._-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  return (words[0] || '?').slice(0, 2).toUpperCase()
})
</script>

<style scoped>
/* a raised panel: the colour lives in the avatar and the role line */
.user-badge {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.85rem;
  border-radius: 16px;
  border: 1px solid var(--hairline);
  background: linear-gradient(180deg, var(--surface-raised), var(--surface));
  box-shadow: 0 6px 16px -10px rgba(0, 0, 0, 0.6);
  padding: 0.45rem 1.15rem 0.45rem 0.45rem;
  transition:
    border-color 0.15s var(--ease),
    transform 0.15s var(--ease);
}

.user-badge:hover,
.user-badge:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--tone) 45%, transparent);
  transform: translateY(-1px);
}

/* rounded square, a rich gradient of the role's colour */
.user-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.9rem;
  height: 2.9rem;
  border-radius: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tone) 90%, #fff), color-mix(in srgb, var(--tone) 60%, #000));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 4px 10px -4px color-mix(in srgb, var(--tone) 60%, transparent);
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
}

.user-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.08rem;
  font-weight: 800;
  color: #fff;
}

.user-role {
  margin-top: 0.2rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--tone) 70%, #fff);
}

/* green, with a ring pulsing out of it: logged in now */
.user-dot {
  position: relative;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--color-emerald-400);
}

.user-dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--color-emerald-400);
  animation: online-pulse 1.8s ease-out infinite;
}

@keyframes online-pulse {
  from {
    transform: scale(1);
    opacity: 0.7;
  }
  to {
    transform: scale(2.6);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .user-dot::after {
    animation: none;
    opacity: 0;
  }
}
</style>
