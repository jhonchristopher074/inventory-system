<template>
  <!-- Who is logged in, at the top of every page: their initials in their
       role's colour, the name, then the role. Top right, before the bell.
       Opens their profile. -->
  <RouterLink
    :to="to"
    class="user-badge"
    :class="`tone-${roleTone(role)}`"
    :title="`Logged in as ${displayName} (${roleLabel(role)}). Open your profile.`"
  >
    <span class="user-avatar" aria-hidden="true">
      {{ initials }}
      <!-- online: this session is active -->
      <span class="user-online"></span>
    </span>

    <!-- the name, then the role beside it -->
    <span class="min-w-0">
      <span class="user-caption">Logged in as</span>
      <span class="user-name">{{ displayName }}</span>
    </span>
    <span class="user-role">{{ roleLabel(role) }}</span>
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
.user-badge {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.75rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tone) 35%, transparent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--tone) 16%, transparent), transparent 75%),
    var(--surface);
  box-shadow: var(--shadow-card);
  padding: 0.35rem 0.6rem 0.35rem 0.35rem;
}

.user-badge:hover,
.user-badge:focus-visible {
  border-color: color-mix(in srgb, var(--tone) 60%, transparent);
}

.user-avatar {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 999px;
  background: var(--tone);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone) 25%, transparent);
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #0a0a0c;
}

/* white letters on the brand red; the lighter colours keep dark ones */
.tone-red .user-avatar {
  color: #fff;
}

.user-online {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  border: 2px solid var(--surface);
  background: var(--color-emerald-400);
}

.user-caption {
  display: block;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-zinc-400);
}


.user-name {
  display: block;
  margin-top: 0.1rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  font-weight: 800;
  color: #fff;
}

.user-role {
  flex: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 20%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone) 40%, transparent);
  padding: 0.1rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tone);
}



/* small phones: "Logged in as" goes, the name and role stay */
@media (max-width: 420px) {
  .user-caption {
    display: none;
  }
}
</style>
