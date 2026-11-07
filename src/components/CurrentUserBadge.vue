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
/* the role's colour in measured touches: a deep solid avatar, a thin
   border and the role chip; the card itself stays calm (no glow) */
.user-badge {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.65rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--tone) 8%, transparent), transparent 60%),
    var(--surface);
  padding: 0.3rem 0.75rem 0.3rem 0.3rem;
  transition: border-color 0.15s var(--ease), background-color 0.15s var(--ease);
}

.user-badge:hover,
.user-badge:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--tone) 55%, transparent);
}

.user-avatar {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  /* the role's colour, a shade deeper so it doesn't glare */
  background: linear-gradient(145deg, color-mix(in srgb, var(--tone) 85%, #fff), color-mix(in srgb, var(--tone) 65%, #000));
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
}

.user-online {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  border: 2px solid var(--surface);
  background: var(--color-emerald-400);
}

.user-caption {
  display: block;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

.user-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 800;
  line-height: 1.25;
  color: #fff;
}

.user-role {
  flex: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 14%, transparent);
  padding: 0.15rem 0.6rem;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--tone) 75%, #fff);
}

/* small phones: "Logged in as" goes, the name and role stay */
@media (max-width: 420px) {
  .user-caption {
    display: none;
  }
}
</style>
