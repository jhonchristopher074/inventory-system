<template>
  <div>
    <PageHeader
      title="Profile"
      subtitle="Manage your account information."
    />

    <div class="grid gap-5 lg:grid-cols-[350px_1fr]">
      <!-- PROFILE CARD -->
      <div
        class="rounded-[28px] border border-white/10 bg-zinc-900 p-6"
      >
        <div class="flex flex-col items-center">
          <!-- PROFILE IMAGE -->
          <div
            class="relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-red-500 bg-black"
          >
            <img
              v-if="profileImage"
              :src="profileImage"
              class="h-full w-full object-cover"
            />

            <span
              v-else
              class="text-5xl font-black text-white"
            >
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
            class="mt-4 rounded-2xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700"
            @click="fileInput.click()"
          >
            Change Photo
          </button>

          <h2 class="mt-6 text-3xl font-black text-white">
            {{ profile.full_name || 'Staff User' }}
          </h2>

          <p class="mt-1 text-zinc-400">
            {{ profile.email }}
          </p>

          <div
            class="mt-4 rounded-full bg-red-950 px-4 py-2 text-sm font-bold text-red-400"
          >
            STAFF ACCOUNT
          </div>
        </div>

        <!-- STATS -->
        <div class="mt-8 space-y-4">
          <div
            class="rounded-2xl bg-black p-4"
          >
            <p class="text-sm text-zinc-400">
              Documentation Records
            </p>

            <h3 class="mt-2 text-3xl font-black text-white">
              {{ documentationCount }}
            </h3>
          </div>

          <div
            class="rounded-2xl bg-black p-4"
          >
            <p class="text-sm text-zinc-400">
              Product Reports
            </p>

            <h3 class="mt-2 text-3xl font-black text-white">
              {{ reportCount }}
            </h3>
          </div>
        </div>
      </div>

      <!-- PROFILE FORM -->
      <div
        class="rounded-[28px] border border-white/10 bg-zinc-900 p-6"
      >
        <h2 class="text-3xl font-black text-white">
          Account Information
        </h2>

        <div class="mt-6 grid gap-5">
          <!-- FULL NAME -->
          <div>
            <label class="mb-2 block text-sm font-bold text-zinc-300">
              Full Name
            </label>

            <input
              v-model="profile.full_name"
              type="text"
              class="w-full rounded-2xl border border-white/10 bg-zinc-800 p-4 text-white outline-none focus:border-red-500"
            />
          </div>

          <!-- EMAIL -->
          <div>
            <label class="mb-2 block text-sm font-bold text-zinc-300">
              Email
            </label>

            <input
              :value="profile.email"
              disabled
              type="text"
              class="w-full rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-500"
            />
          </div>

          <!-- ROLE -->
          <div>
            <label class="mb-2 block text-sm font-bold text-zinc-300">
              Role
            </label>

            <input
              :value="profile.role"
              disabled
              type="text"
              class="w-full rounded-2xl border border-white/10 bg-zinc-950 p-4 uppercase text-zinc-500"
            />
          </div>
        </div>

        <!-- SUCCESS -->
        <div
          v-if="successMessage"
          class="mt-5 rounded-2xl bg-emerald-600/20 p-4 text-emerald-400"
        >
          {{ successMessage }}
        </div>

        <!-- ERROR -->
        <div
          v-if="errorMessage"
          class="mt-5 rounded-2xl bg-red-600/20 p-4 text-red-400"
        >
          {{ errorMessage }}
        </div>

        <!-- BUTTON -->
        <button
          class="mt-6 w-full rounded-2xl bg-red-600 py-4 text-xl font-black text-white transition hover:bg-red-700"
          @click="updateProfile"
        >
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const profile = ref({
  id: '',
  full_name: '',
  email: '',
  role: '',
  avatar_url: '',
})

const documentationCount = ref(0)
const reportCount = ref(0)

const saving = ref(false)

const successMessage = ref('')
const errorMessage = ref('')

const selectedFile = ref(null)

const fileInput = ref(null)

const profileImage = computed(() => {
  return profile.value.avatar_url || ''
})

const initials = computed(() => {
  return profile.value.full_name
    ?.split(' ')
    .map(name => name[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
})

onMounted(() => {
  fetchProfile()
  fetchStats()
})

async function fetchProfile() {
  const currentUser = JSON.parse(
    localStorage.getItem('currentUser') || '{}'
  )

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single()

  if (data) {
    profile.value = data
  }
}

async function fetchStats() {
  const currentUser = JSON.parse(
    localStorage.getItem('currentUser') || '{}'
  )

  const currentStaffName =
    currentUser.full_name ||
    currentUser.email

  const { data } = await supabase
    .from('documentations')
    .select('*')
    .eq('created_by', currentStaffName)

  const docs = data || []

  documentationCount.value = docs.length

  reportCount.value = docs.filter(
    doc => doc.type === 'Product Report'
  ).length
}

function handleImageChange(event) {
  selectedFile.value =
    event.target.files?.[0] || null

  if (selectedFile.value) {
    uploadProfileImage()
  }
}

async function uploadProfileImage() {
  if (!selectedFile.value) return

  try {
    const file = selectedFile.value

    const fileExt = file.name.split('.').pop()

    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`

    const filePath = `avatars/${fileName}`

    const { error: uploadError } =
      await supabase.storage
        .from('documents')
        .upload(filePath, file)

    if (uploadError) {
      errorMessage.value = uploadError.message
      return
    }

    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    const imageUrl = data.publicUrl

    const { error } = await supabase
      .from('profiles')
      .update({
        avatar_url: imageUrl,
      })
      .eq('id', profile.value.id)

    if (error) {
      errorMessage.value = error.message
      return
    }

    profile.value.avatar_url = imageUrl

    successMessage.value =
      'Profile photo updated successfully.'
  } catch (err) {
    errorMessage.value = err.message
  }
}

async function updateProfile() {
  saving.value = true

  successMessage.value = ''
  errorMessage.value = ''

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: profile.value.full_name,
    })
    .eq('id', profile.value.id)

  if (error) {
    errorMessage.value = error.message
    saving.value = false
    return
  }

  successMessage.value =
    'Profile updated successfully.'

  saving.value = false
}
</script>