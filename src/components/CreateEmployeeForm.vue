<script setup>
// Admin form: create an employee. There is NO password field — the server
// generates one and it is revealed once in TempPasswordReveal.
import { ref } from 'vue'
import { supabase } from '../lib/supabase' // adjust to your project's Supabase client path
import TempPasswordReveal from './TempPasswordReveal.vue'
// a pasted name or email loses the invisible characters it brought along
// (the email its spaces too)
import { cleanEmail, vClean } from '../lib/cleanText'

const emit = defineEmits(['created'])

const email = ref('')
const fullName = ref('')
const role = ref('staff')
const loading = ref(false)
const error = ref('')
const reveal = ref(null) // { email, password, expiresAt } — held only in memory

async function readError(fnError) {
  try { return (await fnError.context.json()).error } catch { return null }
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const { data, error: fnError } = await supabase.functions.invoke('create-employee', {
      body: { email: cleanEmail(email.value), full_name: fullName.value.trim(), role: role.value },
    })
    if (fnError) {
      error.value = (await readError(fnError)) || 'Could not create the account.'
      return
    }
    reveal.value = { email: data.email, password: data.temp_password, expiresAt: data.expires_at }
    emit('created', { user_id: data.user_id, email: data.email, role: data.role })
    email.value = fullName.value = ''
    role.value = 'staff'
  } finally {
    loading.value = false
  }
}

function closeReveal() {
  reveal.value = null // discard the password from memory
}
</script>

<template>
  <form class="ce-form" @submit.prevent="submit">
    <h2>Add employee</h2>

    <label for="ce-name">Full name</label>
    <input id="ce-name" v-model="fullName" v-clean type="text" required autocomplete="off" />

    <label for="ce-email">Email</label>
    <input id="ce-email" v-model="email" v-clean:email type="email" required autocomplete="off"
           autocapitalize="off" spellcheck="false" />

    <label for="ce-role">Role</label>
    <select id="ce-role" v-model="role">
      <option value="staff">Staff</option>
      <option value="cashier">Cashier</option>
      <option value="supplier">Supplier</option>
    </select>

    <p class="ce-note">A secure temporary password will be generated automatically.</p>
    <p v-if="error" class="ce-error" role="alert">{{ error }}</p>

    <button type="submit" :disabled="loading || !email || !fullName">
      {{ loading ? 'Creating…' : 'Create account' }}
    </button>
  </form>

  <TempPasswordReveal v-if="reveal" :email="reveal.email" :password="reveal.password"
                      :expires-at="reveal.expiresAt" @close="closeReveal" />
</template>

<style scoped>
.ce-form { display: grid; gap: 6px; max-width: 420px; background: #141417; border: 1px solid #26262b; border-radius: 16px; padding: 22px; color: #f4f4f5; }
h2 { margin: 0 0 8px; font-size: 1.15rem; }
label { font-size: .8rem; font-weight: 600; color: #d4d4d8; margin-top: 8px; }
input, select { background: #0e0e11; border: 1px solid #2e2e34; border-radius: 10px; color: inherit; padding: 10px 12px; font-size: .95rem; }
input:focus, select:focus { outline: none; border-color: #e11d48; }
.ce-note { font-size: .8rem; color: #a1a1aa; margin: 10px 0 0; }
.ce-error { font-size: .85rem; color: #fda4af; margin: 6px 0 0; }
button { margin-top: 14px; padding: 11px; border: 0; border-radius: 10px; background: #e11d48; color: #fff; font-weight: 700; cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
</style>