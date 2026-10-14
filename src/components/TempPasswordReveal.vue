<script setup>
// One-time display of a generated temporary password, with a copy button.
// The parent should clear the password from memory when this closes.
import { ref } from 'vue'

const props = defineProps({
  email: { type: String, required: true },
  password: { type: String, required: true },
  expiresAt: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const copied = ref(false)
const visible = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.password)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    visible.value = true // fallback: let the admin read it
  }
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : ''
}
</script>

<template>
  <Teleport to="body">
  <div class="tp-backdrop" role="dialog" aria-modal="true" aria-labelledby="tp-title">
    <div class="tp-card">
      <h2 id="tp-title">Temporary password created</h2>
      <p class="tp-sub">For <strong>{{ email }}</strong></p>

      <div class="tp-box">
        <code>{{ visible ? password : '•'.repeat(password.length) }}</code>
        <button type="button" @click="visible = !visible">{{ visible ? 'Hide' : 'Show' }}</button>
        <button type="button" class="tp-copy" @click="copy">{{ copied ? 'Copied!' : 'Copy' }}</button>
      </div>

      <div class="tp-warning">
        <strong>This password will not be shown again.</strong>
        Give it to the employee in person or through a private channel — not in a group chat.
        They must change it on first login<span v-if="expiresAt">, before {{ formatDate(expiresAt) }}</span>.
      </div>

      <button type="button" class="tp-done" @click="emit('close')">I've saved it — close</button>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.tp-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: grid; place-items: center; padding: 16px; z-index: 2000; }
.tp-card { width: 100%; max-width: 440px; background: #141417; border: 1px solid #26262b; border-radius: 16px; padding: 24px; color: #f4f4f5; }
h2 { margin: 0 0 4px; font-size: 1.2rem; }
.tp-sub { margin: 0 0 16px; color: #a1a1aa; font-size: .9rem; }
.tp-box { display: flex; align-items: center; gap: 6px; background: #0e0e11; border: 1px solid #2e2e34; border-radius: 10px; padding: 8px 8px 8px 12px; }
.tp-box code { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 1rem; letter-spacing: .04em; }
.tp-box button { background: #26262b; border: 0; color: #f4f4f5; border-radius: 8px; padding: 7px 10px; cursor: pointer; font-size: .8rem; }
.tp-box .tp-copy { background: #e11d48; font-weight: 700; }
.tp-warning { margin-top: 14px; font-size: .82rem; line-height: 1.45; color: #fcd34d; background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.35); border-radius: 10px; padding: 10px 12px; }
.tp-warning strong { display: block; margin-bottom: 2px; }
.tp-done { width: 100%; margin-top: 16px; padding: 11px; border: 0; border-radius: 10px; background: #26262b; color: #f4f4f5; font-weight: 600; cursor: pointer; }
</style>