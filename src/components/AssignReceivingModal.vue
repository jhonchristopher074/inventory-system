<template>
  <!-- "Not delivered yet": the owner picks the staff member who will receive
       the goods of this receipt, and when they're expected. The prices from
       Check prices are kept; what arrives goes into stock when the staff
       member marks it delivered.
       reassign: the same window, to give a waiting delivery to someone else
       (or change its date). -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[2100] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-title"
      @click.self="!busy && emit('cancel')"
      @keydown.esc="!busy && emit('cancel')"
    >
      <form class="w-full max-w-md rounded-[24px] border border-sky-500/30 bg-zinc-900 p-6 shadow-2xl" @submit.prevent="submit">
        <p class="text-xs font-extrabold uppercase tracking-[0.14em] text-sky-300">{{ reassign ? 'Reassign staff' : 'Not delivered yet' }}</p>
        <h2 id="assign-title" class="mt-1 text-xl font-bold text-white">Who will receive it?</h2>
        <p class="mt-1 truncate text-sm text-zinc-400" :title="fileName">
          {{ fileName }} · {{ count(products) }} {{ products === 1 ? 'product' : 'products' }} · {{ count(pieces) }} pcs
        </p>

        <label class="mt-5 block text-sm font-bold text-zinc-200" for="assign-staff">Staff member</label>
        <select
          id="assign-staff"
          v-model="staffId"
          class="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
          :disabled="busy || staff.length === 0"
        >
          <option value="" disabled>{{ staff.length === 0 ? 'No active staff accounts' : 'Choose…' }}</option>
          <option v-for="person in staff" :key="person.id" :value="person.id">
            {{ person.full_name || person.email }}
          </option>
        </select>

        <label class="mt-4 block text-sm font-bold text-zinc-200" for="assign-date">Expected delivery</label>
        <div class="mt-1.5">
          <DatePicker id="assign-date" v-model="expectedDate" :min="today" :disabled="busy" quick clearable placeholder="No date yet" />
        </div>

        <template v-if="!reassign">
        <label class="mt-4 block text-sm font-bold text-zinc-200" for="assign-note">Note for the staff member <span class="font-normal text-zinc-500">(optional)</span></label>
        <input
          id="assign-note"
          v-model="note"
          type="text"
          maxlength="200"
          autocomplete="off"
          placeholder="e.g. check the faucets for damage"
          class="mt-1.5 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400"
          :disabled="busy"
        />

        <p class="mt-4 rounded-xl bg-sky-500/10 p-3 text-xs leading-relaxed text-sky-200">
          The prices you set are kept. When it arrives, the staff member counts it and marks it
          delivered: only what arrived goes into stock, and you get the details.
        </p>
        </template>

        <p v-if="message" class="mt-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ message }}</p>

        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="rounded-2xl bg-zinc-800 px-5 py-3 font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Back
          </button>
          <button
            type="submit"
            class="rounded-2xl bg-sky-600 px-5 py-3 font-bold text-white hover:bg-sky-500 disabled:opacity-50"
            :disabled="busy || staff.length === 0"
          >
            {{ buttonText }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import DatePicker from './DatePicker.vue'
import { computed, ref, watch } from 'vue'
import { count } from '../lib/format'
import { todayKey } from '../lib/receiving'

const props = defineProps({
  fileName: { type: String, default: 'Receipt' },
  products: { type: Number, default: 0 },
  pieces: { type: Number, default: 0 },
  // active staff accounts: [{ id, full_name, email }]
  staff: { type: Array, default: () => [] },
  // giving a waiting delivery to someone else: no note, start from these
  reassign: { type: Boolean, default: false },
  currentStaffId: { type: String, default: '' },
  currentDate: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['confirm', 'cancel'])

const today = todayKey()
const staffId = ref(props.currentStaffId || (props.staff.length === 1 ? props.staff[0].id : ''))
const expectedDate = ref(props.currentDate || today)
const note = ref('')
const missing = ref('')
const message = computed(() => missing.value || props.error)

// the list can arrive after the window opens: one staff member = chosen
watch(
  () => props.staff,
  (list) => {
    if (!staffId.value && list.length === 1) staffId.value = list[0].id
  }
)

const chosenName = computed(() => {
  const person = props.staff.find((p) => p.id === staffId.value)
  return person ? String(person.full_name || person.email).split(/\s+/)[0] : ''
})

const buttonText = computed(() => {
  if (props.busy) return props.reassign ? 'Saving…' : 'Sending…'
  if (props.reassign && staffId.value === props.currentStaffId) return 'Save the date'
  const to = props.reassign ? 'Assign to' : 'Send to'
  return chosenName.value ? `${to} ${chosenName.value}` : `${to} staff`
})

function submit() {
  if (!staffId.value) {
    missing.value = 'Choose the staff member who will receive it.'
    return
  }
  missing.value = ''
  emit('confirm', { staffId: staffId.value, expectedDate: expectedDate.value, note: note.value.trim() })
}
</script>
