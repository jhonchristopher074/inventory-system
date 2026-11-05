<template>
  <!-- The Owner's store logo (Profile page): pick a picture, crop it to a
       square, then type your password to put it up. Only the current logo
       is kept: the old file is deleted. (lib/storeLogo.js, and the SQL in
       supabase/migrations/20261101000002_store_logo.sql) -->
  <div class="card p-4">
    <!-- one row, so the Profile page fits the screen; what's allowed is in
         the button's hint (and a wrong file is refused with a message) -->
    <div class="flex items-center gap-3">
      <img
        :src="logoUrl"
        alt="The store logo"
        class="h-12 w-12 shrink-0 rounded-xl bg-black/30 object-contain p-1"
        @error="showDefaultLogo"
      />
      <div class="min-w-0 flex-1" title="Shown in the menu, on the login page and in the browser tab">
        <p class="font-bold text-white">Store logo</p>
        <p class="truncate text-xs text-zinc-500">{{ logoPath ? 'Your logo' : 'Built-in logo' }}</p>
        <p class="truncate text-xs text-zinc-500">Pictures only (PNG, JPG, WebP) · up to 10 MB</p>
      </div>

      <!-- a label, so the whole button opens the file picker -->
      <label
        class="shrink-0 cursor-pointer rounded-xl bg-red-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-red-700"
        :class="{ 'pointer-events-none opacity-50': busy }"
        title="PNG, JPG or WebP, up to 10 MB. You crop it to a square next."
      >
        Change
        <input
          type="file"
          :accept="LOGO_TYPES.join(',')"
          class="sr-only"
          :disabled="busy"
          @change="pick"
        />
      </label>
    </div>

    <button
      v-if="logoPath"
      type="button"
      class="mt-2 text-xs font-bold text-zinc-400 hover:text-white disabled:opacity-50"
      :disabled="busy"
      @click="askBuiltIn"
    >
      Use the built-in logo instead
    </button>

    <p v-if="error" class="mt-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ error }}</p>
    <p v-if="success" class="mt-3 rounded-xl bg-emerald-600/15 p-3 text-sm text-emerald-400">{{ success }}</p>

    <LogoCropper v-if="cropFile" :file="cropFile" @done="cropped" @cancel="cropFile = null" />

    <AdminPasswordPrompt
      v-if="prompt"
      :title="prompt.title"
      :message="prompt.message"
      :confirm-label="prompt.confirmLabel"
      :error="promptError"
      :busy="busy"
      @confirm="confirm"
      @cancel="cancelPrompt"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import {
  LOGO_BUCKET,
  LOGO_MAX_INPUT_BYTES,
  LOGO_TYPES,
  logoPath,
  logoUrl,
  setLogoPath,
  showDefaultLogo,
} from '../lib/storeLogo'
import LogoCropper from './LogoCropper.vue'
import AdminPasswordPrompt from './AdminPasswordPrompt.vue'

const cropFile = ref(null)
const prompt = ref(null) // { title, message, confirmLabel, blob }
const promptError = ref('')
const busy = ref(false)
const error = ref('')
const success = ref('')

const NOT_SET_UP =
  "The logo can't be changed yet: the database part isn't set up. Run supabase/migrations/20261101000002_store_logo.sql in Supabase first."

function pick(event) {
  const file = event.target.files?.[0]
  // the same file can be picked again after a Cancel
  event.target.value = ''
  error.value = ''
  success.value = ''
  if (!file) return

  if (!LOGO_TYPES.includes(file.type)) {
    error.value = 'Pick a PNG, JPG or WebP picture.'
    return
  }
  if (file.size > LOGO_MAX_INPUT_BYTES) {
    error.value = `This picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. Pick one up to 10 MB.`
    return
  }

  cropFile.value = file
}

// cropped: the password comes next
function cropped(blob) {
  cropFile.value = null
  promptError.value = ''
  prompt.value = {
    title: 'Change the store logo',
    message: 'Type your password to put up the new logo. The old one is deleted.',
    confirmLabel: 'Change logo',
    blob,
  }
}

function askBuiltIn() {
  error.value = ''
  success.value = ''
  promptError.value = ''
  prompt.value = {
    title: 'Use the built-in logo',
    message: 'Type your password to go back to the built-in logo. Your uploaded logo is deleted.',
    confirmLabel: 'Use built-in',
    blob: null,
  }
}

function cancelPrompt() {
  if (busy.value) return
  prompt.value = null
  promptError.value = ''
}

// a message anyone can act on, from what Supabase answered
function explain(err) {
  const text = String(err?.message || err || '')
  if (/bucket not found|could not find the function|PGRST202|admin_set_store_logo/i.test(text + (err?.code || ''))) {
    return NOT_SET_UP
  }
  if (/exceeded the maximum allowed size|payload too large|413/i.test(text)) return 'The logo is over 1 MB.'
  if (/mime type|not supported/i.test(text)) return 'Only PNG, JPG and WebP logos are allowed.'
  return text || 'Something went wrong. Try again.'
}

// Deletes every logo file except the one in use (the old one, and any left
// over from a try that didn't finish). Not fatal if it fails.
async function removeOtherLogos(keep) {
  const { data, error: listError } = await supabase.storage.from(LOGO_BUCKET).list('', { limit: 100 })
  if (listError) {
    console.warn('Store logo: could not list old logos.', listError.message)
    return
  }

  const old = (data || []).map((file) => file.name).filter((name) => name && name !== keep)
  if (old.length === 0) return

  const { error: removeError } = await supabase.storage.from(LOGO_BUCKET).remove(old)
  if (removeError) console.warn('Store logo: could not delete old logos.', removeError.message)
}

async function confirm(password) {
  if (!prompt.value || busy.value) return
  busy.value = true
  promptError.value = ''

  const blob = prompt.value.blob
  let path = null

  try {
    if (blob) {
      const ext = blob.type === 'image/webp' ? 'webp' : 'png'
      path = `logo-${Date.now()}.${ext}`

      // a new name each time, so browsers never show a stale copy
      const { error: uploadError } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })

      if (uploadError) throw uploadError
    }

    const { error: setError } = await supabase.rpc('admin_set_store_logo', {
      p_password: password,
      p_path: path,
    })

    if (setError) {
      // not put up (e.g. wrong password): don't leave the new file behind
      if (path) await supabase.storage.from(LOGO_BUCKET).remove([path])
      throw setError
    }

    setLogoPath(path)
    await removeOtherLogos(path)

    prompt.value = null
    success.value = path ? 'New logo saved. It shows everywhere now.' : 'Back to the built-in logo.'
  } catch (err) {
    const message = explain(err)

    // wrong password: ask again in the same window
    if (/wrong password/i.test(message)) {
      promptError.value = 'Wrong password. Try again.'
    } else {
      prompt.value = null
      error.value = message
    }
  } finally {
    busy.value = false
  }
}
</script>
