<script setup>
// Profile shared by the staff and cashier pages: who you are (read-only:
// only the administrator can change a name or email), your password, and
// role-specific numbers ("stats", e.g. the staff documentation counts).
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import ChangeOwnPasswordModal from './ChangeOwnPasswordModal.vue'
import NavIcon from './NavIcon.vue'

defineProps({
  // [{ label, value, icon }] shown under "Your activity"
  stats: { type: Array, default: () => [] },
})

const profile = ref({
  full_name: '',
  email: '',
  role: '',
  is_active: true,
})

const loading = ref(true)
const showOwnPassword = ref(false)
const errorMessage = ref('')

async function fetchProfile() {
  const { data, error } = await supabase.rpc('get_my_profile')

  loading.value = false

  if (error) {
    errorMessage.value = error.message
    return
  }

  if (data) profile.value = data
}

function formatDay(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// Each fact once: name and email at the top, the rest as small tiles.
// Account number and start date only show when the account has them.
const details = computed(() => {
  const p = profile.value
  const role = String(p.role || '').trim()
  const active = p.is_active !== false

  const list = [
    { label: 'Role', value: role ? role.charAt(0).toUpperCase() + role.slice(1) : '—', icon: 'profile' },
    {
      label: 'Status',
      value: active ? 'Active' : 'Disabled',
      icon: 'check',
      tone: active ? 'text-emerald-400' : 'text-red-400',
    },
  ]

  if (p.account_no) list.push({ label: 'Account No.', value: `#${p.account_no}`, icon: 'hash' })

  const since = formatDay(p.created_at)
  if (since) list.push({ label: 'Member since', value: since, icon: 'calendar' })

  return list
})

onMounted(fetchProfile)
</script>

<template>
  <div>
    <p v-if="errorMessage" class="mb-5 rounded-2xl bg-red-600/20 p-4 text-red-400" role="alert">
      Couldn't load your profile: {{ errorMessage }}
    </p>

    <!-- one card, top to bottom: who you are (details beside it on wide
         screens), activity, password -->
    <section class="card overflow-hidden" aria-labelledby="profile-name">
      <div class="profile-hero flex flex-col gap-6 px-6 pb-6 pt-7 xl:flex-row xl:items-center xl:justify-between">
        <div class="min-w-0">
          <h2 id="profile-name" class="break-words text-3xl font-black text-white">
            {{ profile.full_name || (loading ? 'Loading…' : 'No name') }}
          </h2>

          <p class="mt-1 break-all text-zinc-400">{{ profile.email }}</p>

          <p class="mt-3 flex items-center gap-2 text-xs text-zinc-500">
            <NavIcon name="lock" class="h-3.5 w-3.5 shrink-0" />
            Only the administrator can change your name or email.
          </p>
        </div>

        <ul class="tile-grid xl:w-[34rem] xl:shrink-0" aria-label="Details">
          <li v-for="item in details" :key="item.label" class="info-tile">
            <span class="info-icon" :class="item.tone || 'text-red-400'">
              <NavIcon :name="item.icon" class="h-[18px] w-[18px]" />
            </span>
            <div class="min-w-0">
              <p class="eyebrow">{{ item.label }}</p>
              <p class="truncate font-bold" :class="item.tone || 'text-white'">{{ item.value }}</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- role-specific numbers, e.g. the staff documentation counts -->
      <div v-if="stats.length" class="px-6 pb-6">
        <p class="eyebrow mb-3">Your activity</p>

        <ul class="tile-grid">
          <li v-for="stat in stats" :key="stat.label" class="info-tile">
            <span class="info-icon text-red-400">
              <NavIcon :name="stat.icon" class="h-[18px] w-[18px]" />
            </span>
            <div class="min-w-0">
              <p class="text-2xl font-black leading-none text-white">{{ stat.value }}</p>
              <p class="mt-1 text-sm text-zinc-400">{{ stat.label }}</p>
            </div>
          </li>
        </ul>
      </div>

      <!-- PASSWORD -->
      <div
        class="flex flex-col gap-4 border-t border-white/5 bg-black/20 px-6 py-5 sm:flex-row sm:items-center"
        aria-labelledby="password-title"
        role="group"
      >
        <span class="icon-badge">
          <NavIcon name="key" class="h-5 w-5" />
        </span>

        <div class="min-w-0 flex-1">
          <h3 id="password-title" class="font-bold text-white">Password</h3>
          <p class="text-sm text-zinc-400">
            Change it any time. You'll be asked for your current password first.
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            A strong password has at least 8 characters, upper and lower case letters, a
            number and a symbol.
          </p>
        </div>

        <button
          class="w-full shrink-0 rounded-xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700 sm:w-auto"
          @click="showOwnPassword = true"
        >
          Change Password
        </button>
      </div>
    </section>

    <ChangeOwnPasswordModal v-if="showOwnPassword" @close="showOwnPassword = false" />
  </div>
</template>

<style scoped>
/* a soft crimson glow behind the name, like the sidebar's brand card */
.profile-hero {
  background:
    radial-gradient(120% 160% at 0% 0%, rgba(244, 52, 76, 0.2), transparent 55%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
}

.eyebrow {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

/* tiles keep their size and wrap, instead of stretching over a wide screen */
.tile-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
}

/* one read-only fact (not a box you can type in) */
.info-tile {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(0, 0, 0, 0.25);
  padding: 0.8rem 0.95rem;
}

.info-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.7rem;
  background: rgba(255, 255, 255, 0.04);
}

.icon-badge {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(224, 27, 50, 0.3);
  background: rgba(224, 27, 50, 0.14);
  color: var(--color-red-400);
}
</style>
