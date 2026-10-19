<script setup>
// Profile shared by the staff and cashier pages: photo, account details
// (read-only — only the administrator can change a name or email) and
// password change. Role-specific numbers go in the "stats" slot.
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { uploadImage, removeUploadedImage } from '../lib/uploadImage'
import ChangeOwnPasswordModal from './ChangeOwnPasswordModal.vue'

defineProps({
  roleLabel: { type: String, default: 'ACCOUNT' },
})

const profile = ref({
  full_name: '',
  email: '',
  role: '',
  is_active: true,
  avatar_url: '',
})

const fileInput = ref(null)
const uploading = ref(false)
const showOwnPassword = ref(false)

const successMessage = ref('')
const errorMessage = ref('')

const initials = computed(() =>
  String(profile.value.full_name || profile.value.email || '?')
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
)

async function fetchProfile() {
  const { data, error } = await supabase.rpc('get_my_profile')

  if (error) {
    errorMessage.value = error.message
    return
  }

  if (data) profile.value = data
}

async function handleImageChange(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // so picking the same file again still works

  if (!file) return

  successMessage.value = ''
  errorMessage.value = ''
  uploading.value = true

  try {
    // Any phone photo up to 10 MB; it's shrunk to 512 px first (it only
    // shows small), so what's saved is about 50–150 KB.
    const imageUrl = await uploadImage(file, {
      bucket: 'documents',
      folder: 'avatars',
      maxBytes: 10 * 1024 * 1024,
      maxSide: 512,
    })

    const { error } = await supabase.rpc('update_my_avatar', {
      p_avatar_url: imageUrl,
    })

    if (error) {
      // the row didn't save, so don't leave the file orphaned in the bucket
      await removeUploadedImage(imageUrl, 'documents')
      errorMessage.value = error.message
      return
    }

    profile.value.avatar_url = imageUrl
    successMessage.value = 'Profile photo updated.'
  } catch (err) {
    errorMessage.value = err.message
  } finally {
    uploading.value = false
  }
}

onMounted(fetchProfile)
</script>

<template>
  <div class="grid gap-5 lg:grid-cols-[350px_1fr]">
    <!-- PROFILE CARD -->
    <div class="card p-6">
      <div class="flex flex-col items-center">
        <div
          class="relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-red-500 bg-black"
        >
          <img
            v-if="profile.avatar_url"
            :src="profile.avatar_url"
            :alt="profile.full_name"
            class="h-full w-full object-cover"
          />

          <span v-else class="text-5xl font-black text-white">
            {{ initials }}
          </span>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleImageChange"
        />

        <button
          class="mt-4 rounded-2xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
          :disabled="uploading"
          @click="fileInput.click()"
        >
          {{ uploading ? 'Uploading...' : 'Change Photo' }}
        </button>
        <p class="mt-2 text-xs text-zinc-500">JPG, PNG, WEBP or GIF · up to 10 MB</p>

        <h2 class="mt-6 text-center text-3xl font-black text-white">
          {{ profile.full_name || 'No name' }}
        </h2>

        <p class="mt-1 text-zinc-400">
          {{ profile.email }}
        </p>

        <div class="mt-4 rounded-full bg-red-950 px-4 py-2 text-sm font-bold text-red-400">
          {{ roleLabel }}
        </div>
      </div>

      <!-- role-specific numbers, e.g. the staff documentation counts -->
      <div v-if="$slots.stats" class="mt-8 space-y-4">
        <slot name="stats" />
      </div>
    </div>

    <!-- ACCOUNT INFORMATION -->
    <div class="card p-6">
      <h2 class="text-3xl font-black text-white">
        Account Information
      </h2>

      <p class="mt-1 text-sm text-zinc-500">
        Your name and email can only be changed by the administrator.
      </p>

      <div class="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <p class="field-label">Full Name</p>
          <p class="field-value">{{ profile.full_name || '—' }}</p>
        </div>

        <div>
          <p class="field-label">Email</p>
          <p class="field-value break-all">{{ profile.email || '—' }}</p>
        </div>

        <div>
          <p class="field-label">Role</p>
          <p class="field-value uppercase">{{ profile.role || '—' }}</p>
        </div>

        <div>
          <p class="field-label">Status</p>
          <p
            class="field-value font-bold"
            :class="profile.is_active === false ? 'text-red-400' : 'text-emerald-400'"
          >
            {{ profile.is_active === false ? 'Disabled' : 'Active' }}
          </p>
        </div>
      </div>

      <div v-if="successMessage" class="mt-5 rounded-2xl bg-emerald-600/20 p-4 text-emerald-400">
        {{ successMessage }}
      </div>

      <div v-if="errorMessage" class="mt-5 rounded-2xl bg-red-600/20 p-4 text-red-400">
        {{ errorMessage }}
      </div>

      <!-- PASSWORD -->
      <div class="mt-6 rounded-2xl bg-black p-5">
        <h3 class="text-xl font-bold text-white">Password</h3>

        <p class="mt-1 text-sm text-zinc-400">
          You'll be asked for your current password first.
        </p>

        <button
          class="mt-4 rounded-xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700"
          @click="showOwnPassword = true"
        >
          Change Password
        </button>
      </div>
    </div>

    <ChangeOwnPasswordModal v-if="showOwnPassword" @close="showOwnPassword = false" />
  </div>
</template>

<style scoped>
.field-label {
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: rgb(212 212 216);
}

.field-value {
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgb(9 9 11);
  padding: 1rem;
  color: rgb(212 212 216);
}
</style>
