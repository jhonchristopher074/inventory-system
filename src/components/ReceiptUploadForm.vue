<template>
  <!-- Upload a paper receipt a supplier handed over (lib/receiptUploads.js).
         staff  Supplier Receipts page: it waits for the owner (note optional)
         owner  Approval > Upload receipt: no approval, so the profit
                percentage is asked here and the Approval page sends it to
                the receipt scanner (@done gives { row, file, percent })
       Phones and tablets get "Take a photo" (the camera straight away). -->
  <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
    <!-- 1. the receipt -->
    <div>
      <p class="field-label">1. The receipt</p>

      <div v-if="file" class="rounded-2xl border border-white/10 bg-black/60 p-3">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt="The receipt you chose"
          class="mx-auto max-h-40 w-full rounded-xl object-contain"
        />
        <div class="flex items-center gap-3" :class="{ 'mt-3': previewUrl }">
          <span class="file-kind">{{ isPdf ? 'PDF' : 'IMG' }}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-white" :title="file.name">{{ file.name }}</p>
            <p class="text-xs text-zinc-500">{{ formatFileSize(file.size) }}</p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
            :disabled="busy"
            @click="clearFile"
          >
            Change
          </button>
        </div>
      </div>

      <template v-else>
        <div
          class="drop-zone"
          :class="{ 'drop-zone-active': dragging }"
          role="button"
          tabindex="0"
          aria-label="Choose the receipt"
          @click="openPicker"
          @keydown.enter.prevent="openPicker"
          @keydown.space.prevent="openPicker"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <span class="grid h-11 w-11 place-items-center rounded-full bg-red-600/15 text-red-400">
            <NavIcon name="upload" class="h-5 w-5" />
          </span>
          <p class="mt-2 font-bold text-white">
            <span class="desktop-only">Drop the receipt here, or click to choose</span>
            <span class="phone-only">Choose a photo or PDF</span>
          </p>
          <p class="text-xs text-zinc-500">A photo (JPG, PNG) or a PDF · up to {{ formatFileSize(RECEIPT_MAX_BYTES) }}</p>
        </div>

        <!-- phones and tablets: the camera straight away -->
        <button
          type="button"
          class="touch-only mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700"
          @click="openCamera"
        >
          <NavIcon name="camera" class="h-5 w-5" /> Take a photo of the receipt
        </button>
      </template>

      <input ref="fileInput" type="file" class="hidden" :accept="RECEIPT_ACCEPT" @change="onPicked" />
      <input ref="cameraInput" type="file" class="hidden" accept="image/*" capture="environment" @change="onPicked" />
    </div>

    <!-- the Calendar delivery it's for: fixed (Mark as delivered / Add
         receipt), or picked from the ones waiting for their receipt -->
    <p v-if="deliveryId && !hideDeliveryNote" class="rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
      For the delivery <b class="text-white">{{ deliveryTitle || 'on the calendar' }}</b>
    </p>
    <div v-else-if="deliveries.length > 0">
      <label class="field-label" :for="`${uid}-delivery`">
        Is it for a delivery that already arrived? <span class="font-normal text-zinc-500">(optional)</span>
      </label>
      <select :id="`${uid}-delivery`" v-model="chosenDelivery" class="field-input" :disabled="busy" @change="fillSupplier">
        <option value="">No, not for one of these</option>
        <option v-for="delivery in deliveries" :key="delivery.id" :value="String(delivery.id)">
          Yes: {{ delivery.title }}{{ delivery.supplier ? ` · ${delivery.supplier}` : '' }}
        </option>
      </select>
    </div>

    <!-- 2. where it came from -->
    <div>
      <label class="field-label" :for="`${uid}-supplier`">2. Supplier name</label>
      <input
        :id="`${uid}-supplier`"
        v-model="supplierName"
        type="text"
        maxlength="120"
        autocomplete="off"
        placeholder="As written on the receipt"
        class="field-input"
        :disabled="busy"
      />
    </div>

    <!-- 3. staff: a note for the owner / owner: the profit -->
    <div v-if="mode === 'staff'">
      <label class="field-label" :for="`${uid}-note`">
        3. Note for the owner <span class="font-normal text-zinc-500">(optional)</span>
      </label>
      <!-- the owner reads it in Check prices, where he can lower the quantities -->
      <textarea
        :id="`${uid}-note`"
        v-model="note"
        rows="2"
        maxlength="300"
        placeholder="e.g. 3 pcs of the 1/2&quot; pipe are cracked, sent back to the supplier"
        class="field-input resize-none"
        :disabled="busy"
      ></textarea>
      <p class="mt-1 text-xs text-zinc-500">Faulty or missing items? Write them here: the owner sees it before adding the stock.</p>
    </div>

    <div v-else>
      <label class="field-label" :for="`${uid}-profit`">3. Profit percentage</label>
      <div class="flex items-center gap-2">
        <input
          :id="`${uid}-profit`"
          v-model="percent"
          type="number"
          inputmode="decimal"
          min="0"
          max="1000"
          step="0.01"
          placeholder="e.g. 25"
          class="field-input flex-1"
          :disabled="busy"
        />
        <span class="text-lg font-bold text-zinc-400">%</span>
      </div>
      <p class="mt-1.5 text-xs text-zinc-500">Added to the cost of each new product on this receipt to make its price.</p>
    </div>

    <p v-if="error" class="rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ error }}</p>

    <!-- one row: (Back) on the left, Cancel and Send on the right -->
    <div class="flex flex-col-reverse gap-2 border-t border-white/5 pt-4 sm:flex-row sm:items-center sm:justify-end">
      <div v-if="$slots.back" class="sm:mr-auto">
        <slot name="back" />
      </div>
      <button
        v-if="mode === 'owner' || cancelable"
        type="button"
        class="rounded-2xl bg-zinc-800 px-5 py-3 font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
        :disabled="busy"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
        :disabled="busy"
      >
        <template v-if="busy">Uploading…</template>
        <template v-else-if="mode === 'owner'">Upload &amp; send to the scanner</template>
        <template v-else>Send to the owner</template>
      </button>
    </div>
  </form>
</template>

<script setup>
import { computed, ref, useId, watch } from 'vue'
import NavIcon from './NavIcon.vue'
import {
  RECEIPT_ACCEPT,
  RECEIPT_MAX_BYTES,
  checkReceiptFile,
  formatFileSize,
  submitReceipt,
} from '../lib/receiptUploads'
import { toast } from '../lib/toast'

const props = defineProps({
  // 'staff' (waits for the owner) or 'owner' (straight to the scanner)
  mode: { type: String, default: 'staff' },
  // the Calendar delivery this receipt is for (its goods are here)
  deliveryId: { type: [Number, String], default: null },
  deliveryTitle: { type: String, default: '' },
  // the supplier's name to start with (the delivery's)
  presetSupplier: { type: String, default: '' },
  // deliveries that arrived and wait for their receipt, to pick one (optional)
  deliveries: { type: Array, default: () => [] },
  // a Cancel button beside Send (the owner's form always has one)
  cancelable: { type: Boolean, default: false },
  // the page already says which delivery: no "For the delivery …" line
  hideDeliveryNote: { type: Boolean, default: false },
})

const emit = defineEmits(['done', 'cancel'])

const uid = useId()
const fileInput = ref(null)
const cameraInput = ref(null)
const file = ref(null)
const dragging = ref(false)
const supplierName = ref(props.presetSupplier || '')
const chosenDelivery = ref('')

// picking a delivery fills in its supplier when nothing is written yet
function fillSupplier() {
  const delivery = props.deliveries.find((item) => String(item.id) === chosenDelivery.value)
  if (delivery?.supplier && !supplierName.value.trim()) supplierName.value = delivery.supplier
}
const note = ref('')
const percent = ref('')
const busy = ref(false)
const error = ref('')

const isPdf = computed(() => file.value?.type === 'application/pdf')

// the chosen picture, shown before it's sent (made on this device)
const previewUrl = ref('')
watch(file, (chosen, _before, onCleanup) => {
  previewUrl.value = ''
  if (!chosen || !chosen.type.startsWith('image/')) return
  const url = URL.createObjectURL(chosen)
  previewUrl.value = url
  onCleanup(() => URL.revokeObjectURL(url))
})

function openPicker() {
  if (!busy.value) fileInput.value?.click()
}

function openCamera() {
  if (!busy.value) cameraInput.value?.click()
}

function useFile(chosen) {
  if (!chosen || busy.value) return
  error.value = ''
  const problem = checkReceiptFile(chosen)
  if (problem) {
    error.value = problem
    return
  }
  file.value = chosen
}

function onPicked(event) {
  useFile(event.target.files?.[0])
  event.target.value = '' // the same file can be chosen again
}

function onDrop(event) {
  dragging.value = false
  useFile(event.dataTransfer?.files?.[0])
}

function clearFile() {
  file.value = null
  error.value = ''
}

async function submit() {
  error.value = ''

  const problem = checkReceiptFile(file.value)
  if (problem) {
    error.value = problem
    return
  }

  const supplier = supplierName.value.trim()
  if (!supplier) {
    error.value = 'Write which supplier the receipt is from.'
    return
  }

  let profit = null
  if (props.mode === 'owner') {
    const raw = String(percent.value).trim()
    profit = Number(raw)
    if (raw === '' || !Number.isFinite(profit)) {
      error.value = 'Enter the profit percentage.'
      return
    }
    if (profit < 0 || profit > 1000) {
      error.value = 'The percentage must be between 0 and 1000.'
      return
    }
    profit = Math.round(profit * 100) / 100 // at most 2 decimals
  }

  busy.value = true
  try {
    const sent = file.value
    const row = await submitReceipt({
      file: sent,
      supplierName: supplier,
      note: props.mode === 'staff' ? note.value.trim() : '',
      deliveryId: props.deliveryId || chosenDelivery.value || null,
    })

    if (props.mode === 'staff') {
      toast(`Sent "${row.file_name}" to the owner. You'll see here when it's approved.`)
      file.value = null
      supplierName.value = ''
      chosenDelivery.value = ''
      note.value = ''
    }

    emit('done', { row, file: sent, percent: profit })
  } catch (err) {
    error.value = err.message || 'The upload failed. Try again.'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.field-label {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-zinc-200);
}

.field-input {
  width: 100%;
  border-radius: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #000;
  padding: 0.65rem 0.8rem;
  font-size: 0.9rem;
  color: #fff;
  outline: none;
}

.field-input:focus {
  border-color: var(--color-red-500);
}

.field-input:disabled {
  opacity: 0.6;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 1.1rem;
  border: 2px dashed rgba(255, 255, 255, 0.14);
  background: rgba(0, 0, 0, 0.35);
  padding: 1.1rem 1rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.drop-zone:hover,
.drop-zone:focus-visible,
.drop-zone-active {
  border-color: rgba(244, 52, 76, 0.6);
  background: rgba(224, 27, 50, 0.06);
  outline: none;
}

.file-kind {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.65rem;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--color-zinc-300);
}
</style>
