<script setup>
// "Type your password to confirm" popup for sensitive admin actions.
import { nextTick, onMounted, ref, watch } from 'vue'

// With textLabel set, it also asks for a value (e.g. a new name) and emits
// confirm(password, value).
const props = defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  error: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  textLabel: { type: String, default: '' },
  textValue: { type: String, default: '' },
})
const emit = defineEmits(['confirm', 'cancel'])

const password = ref('')
const show = ref(false)
const input = ref(null)
const text = ref(props.textValue)
const textInput = ref(null)

onMounted(() => nextTick(() => (props.textLabel ? textInput : input).value?.focus()))

// After a wrong password, clear the box and put the cursor back in it.
watch(() => props.error, (value) => {
  if (value) {
    password.value = ''
    nextTick(() => input.value?.focus())
  }
})

function submit() {
  if (!password.value || props.busy) return
  if (props.textLabel && !text.value.trim()) return
  emit('confirm', password.value, text.value.trim())
}
</script>

<template>
  <Teleport to="body">
  <div class="ap-backdrop" role="dialog" aria-modal="true" aria-labelledby="ap-title"
       @keydown.esc="emit('cancel')">
    <form class="ap-card" @submit.prevent="submit">
      <h2 id="ap-title">{{ title }}</h2>
      <p v-if="message" class="ap-message">{{ message }}</p>

      <template v-if="textLabel">
        <label class="ap-label" for="ap-text">{{ textLabel }}</label>
        <div class="ap-field">
          <input id="ap-text" ref="textInput" v-model="text" type="text"
                 maxlength="80" autocomplete="off" />
        </div>
      </template>

      <label class="ap-label" for="ap-password">Your password</label>
      <div class="ap-field">
        <input id="ap-password" ref="input" v-model="password"
               :type="show ? 'text' : 'password'" autocomplete="current-password" />
        <button type="button" class="ap-toggle" @click="show = !show"
                :aria-label="show ? 'Hide password' : 'Show password'">
          {{ show ? 'Hide' : 'Show' }}
        </button>
      </div>

      <p v-if="error" class="ap-error" role="alert">{{ error }}</p>

      <div class="ap-actions">
        <button type="button" class="ap-cancel" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <!-- greyed out until the password (and name) are typed: the hover note says why -->
        <button type="submit" class="ap-confirm"
                :disabled="!password || busy || (textLabel && !text.trim())"
                :title="!password ? 'Type your password first' : (textLabel && !text.trim()) ? 'Type the ' + textLabel.toLowerCase() + ' first' : ''">
          {{ busy ? 'Checking…' : confirmLabel }}
        </button>
      </div>
    </form>
  </div>
  </Teleport>
</template>

<style scoped>
.ap-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: grid; place-items: center; padding: 16px; z-index: 2100; }
.ap-card { width: 100%; max-width: 420px; background: #141417; border: 1px solid #26262b; border-radius: 16px; padding: 24px; color: #f4f4f5; }
h2 { margin: 0 0 6px; font-size: 1.2rem; }
.ap-message { margin: 0 0 14px; color: #a1a1aa; font-size: .9rem; line-height: 1.45; }
.ap-label { display: block; font-size: .8rem; font-weight: 600; color: #d4d4d8; margin: 12px 0 6px; }
.ap-field { display: flex; background: #0e0e11; border: 1px solid #2e2e34; border-radius: 10px; overflow: hidden; }
.ap-field:focus-within { border-color: #e11d48; }
.ap-field input { flex: 1; min-width: 0; background: transparent; border: 0; color: inherit; padding: 11px 12px; font-size: .95rem; outline: none; }
.ap-toggle { background: transparent; border: 0; color: #a1a1aa; padding: 0 12px; cursor: pointer; font-size: .8rem; }
.ap-error { margin: 10px 0 0; font-size: .85rem; color: #fda4af; background: rgba(225,29,72,.12); border: 1px solid rgba(225,29,72,.4); border-radius: 10px; padding: 8px 10px; }
.ap-actions { display: flex; gap: 10px; margin-top: 18px; }
.ap-actions button { flex: 1; padding: 11px; border: 0; border-radius: 10px; font-weight: 700; cursor: pointer; }
.ap-cancel { background: #26262b; color: #f4f4f5; }
.ap-confirm { background: #e11d48; color: #fff; }
/* not the browser's "no entry" cursor: it looked like an error */
.ap-actions button:disabled { opacity: .45; cursor: default; }
</style>