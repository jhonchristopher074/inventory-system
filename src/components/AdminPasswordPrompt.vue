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

// shown under the box when Confirm is pressed with something missing
const missing = ref('')

watch([password, text], () => {
  missing.value = ''
})

// Reads the box itself, not only what was typed: a password the browser
// filled in by itself (saved passwords) shows in the box, but the page only
// gets it from the box. Before, the button stayed greyed out for it.
function submit() {
  if (props.busy) return

  const typed = password.value || input.value?.value || ''

  if (props.textLabel && !text.value.trim()) {
    missing.value = 'Type the ' + props.textLabel.toLowerCase() + ' first.'
    nextTick(() => textInput.value?.focus())
    return
  }

  if (!typed) {
    missing.value = 'Type your password first.'
    nextTick(() => input.value?.focus())
    return
  }

  emit('confirm', typed, text.value.trim())
}
</script>

<template>
  <Teleport to="body">
  <div class="ap-backdrop" role="dialog" aria-modal="true" aria-labelledby="ap-title"
       @keydown.esc="!busy && emit('cancel')">
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

      <p v-if="missing || error" class="ap-error" role="alert">{{ missing || error }}</p>

      <div class="ap-actions">
        <button type="button" class="ap-cancel" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <!-- always pressable: if something is missing it says so under the box -->
        <button type="submit" class="ap-confirm" :disabled="busy">
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