<template>
  <!-- Crop a picture: the store logo (kind="logo": a square PNG of
       LOGO_SIZE, with the menu and tab previews) or a product photo
       (kind="product": a 4:3 JPEG, the shape of the POS cards). Drag (or
       the arrow keys) to move it, the slider (or the mouse wheel, + / -) to
       zoom. "Fit" shows the whole picture, "Fill" fills the frame. Outside
       the picture: see-through for a logo, white for a photo.
       Emits done(blob). -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[2100] flex items-center justify-center overflow-y-auto bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-title"
      @keydown.esc="!busy && emit('cancel')"
    >
      <div class="w-full max-w-xl rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:p-6">
        <h2 id="crop-title" class="text-xl font-bold text-white">{{ isLogo ? 'Crop your logo' : 'Adjust the picture' }}</h2>
        <p class="mt-1 text-sm text-zinc-400">Drag to move it, zoom with the slider. {{ isLogo ? "The square is what's shown." : "The frame is what the product shows." }}</p>

        <p v-if="loadError" class="mt-4 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ loadError }}</p>

        <div v-else class="mt-4 flex flex-wrap items-start gap-5">
          <!-- the crop area: a see-through checkerboard behind the picture -->
          <canvas
            ref="stage"
            class="stage"
            :style="{ width: VIEW_W + 'px', height: VIEW_H + 'px' }"
            tabindex="0"
            :aria-label="`${isLogo ? 'Logo' : 'Picture'} crop area. Arrow keys move the picture, plus and minus zoom.`"
            @pointerdown="startDrag"
            @pointermove="drag"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @keydown="onKey"
          ></canvas>

          <!-- how it will look in the app (the logo) -->
          <div v-if="isLogo" class="flex flex-col gap-3 text-xs text-zinc-400">
            <p class="font-bold uppercase tracking-[0.12em] text-zinc-500">Preview</p>
            <div class="flex items-center gap-2.5 rounded-xl border border-white/10 bg-zinc-950 p-2.5">
              <canvas ref="previewMenu" class="h-10 w-10"></canvas>
              <span class="leading-tight">
                <b class="block text-sm text-white">10 <span class="text-red-500">FIVE</span> 7</b>
                Menu
              </span>
            </div>
            <div class="flex items-center gap-2 rounded-lg bg-zinc-200 px-2.5 py-1.5 text-zinc-700">
              <canvas ref="previewTab" class="h-4 w-4"></canvas>
              Browser tab
            </div>
          </div>
        </div>

        <div v-if="!loadError" class="mt-4 flex items-center gap-3">
          <button type="button" class="zoom-btn" aria-label="Zoom out" :disabled="!ready" @click="zoomBy(-8)">−</button>
          <input
            v-model.number="zoom"
            type="range"
            min="0"
            max="100"
            step="1"
            class="min-w-0 flex-1 accent-red-600"
            aria-label="Zoom"
            :disabled="!ready"
          />
          <button type="button" class="zoom-btn" aria-label="Zoom in" :disabled="!ready" @click="zoomBy(8)">+</button>
          <button type="button" class="fit-btn" :disabled="!ready" @click="setFit">Fit</button>
          <button type="button" class="fit-btn" :disabled="!ready" @click="setFill">Fill</button>
        </div>

        <p v-if="saveError" class="mt-3 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ saveError }}</p>

        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            class="rounded-2xl bg-zinc-800 px-5 py-3 font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
            :disabled="busy"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="!ready || busy"
            @click="finish"
          >
            {{ busy ? 'Preparing…' : isLogo ? 'Use this logo' : 'Use this picture' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LOGO_MAX_BYTES, LOGO_SIZE } from '../lib/storeLogo'

const props = defineProps({
  file: { type: File, required: true },
  // 'logo': a square PNG; 'product': a 4:3 JPEG photo
  kind: { type: String, default: 'logo' },
})

const isLogo = props.kind !== 'product'
// width / height of the frame, and the finished picture's size
const ASPECT = isLogo ? 1 : 4 / 3
const OUT_W = isLogo ? LOGO_SIZE : 1200
const OUT_H = Math.round(OUT_W / ASPECT)
// a product photo: at most 5 MB (lib/uploadImage.js)
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

const emit = defineEmits(['done', 'cancel'])

// the crop frame on screen, in CSS pixels (smaller on narrow phones);
// a photo's frame is wider
const SCREEN_W = typeof window !== 'undefined' ? window.innerWidth : 400
const VIEW_W = isLogo
  ? Math.max(200, Math.min(288, SCREEN_W - 80))
  : Math.max(240, Math.min(456, SCREEN_W - 80))
const VIEW_H = Math.round(VIEW_W / ASPECT)
// pictures bigger than this are shrunk once first, so moving stays smooth
const MAX_SOURCE = 2048

const stage = ref(null)
const previewMenu = ref(null)
const previewTab = ref(null)

const ready = ref(false)
const busy = ref(false)
const loadError = ref('')
const saveError = ref('')

let source = null // the picture (an image or a shrunk canvas)
let width = 0
let height = 0

// zoom: 0 = the whole picture fits, 100 = 4x as big as filling the square
const zoom = ref(0)
let fitScale = 1
let maxScale = 1
// where the picture's centre is, from the square's centre (CSS pixels)
let offsetX = 0
let offsetY = 0

function scaleOf(value) {
  // even steps feel the same whether zoomed in or out
  return fitScale * Math.pow(maxScale / fitScale, value / 100)
}

function zoomFor(scale) {
  return Math.round((Math.log(scale / fitScale) / Math.log(maxScale / fitScale)) * 100) || 0
}

// keep the picture covering the square (zoomed in) or inside it (zoomed out)
function clampOffsets() {
  const scale = scaleOf(zoom.value)
  const limitX = Math.abs(width * scale - VIEW_W) / 2
  const limitY = Math.abs(height * scale - VIEW_H) / 2
  offsetX = Math.min(limitX, Math.max(-limitX, offsetX))
  offsetY = Math.min(limitY, Math.max(-limitY, offsetY))
}

// draws the frame `pixelW` pixels wide (its height follows the frame's shape)
function paint(canvas, pixelW, pixelH = Math.round(pixelW / ASPECT), background = '') {
  const ctx = canvas.getContext('2d')
  const k = pixelW / VIEW_W
  const scale = scaleOf(zoom.value)
  const drawW = width * scale
  const drawH = height * scale

  ctx.clearRect(0, 0, pixelW, pixelH)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, pixelW, pixelH)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    source,
    (VIEW_W / 2 + offsetX - drawW / 2) * k,
    (VIEW_H / 2 + offsetY - drawH / 2) * k,
    drawW * k,
    drawH * k
  )
}

// sizes a canvas for the screen; returns its width in pixels
function sizeCanvas(canvas, cssW, cssH = cssW) {
  const ratio = window.devicePixelRatio || 1
  const w = Math.round(cssW * ratio)
  const h = Math.round(cssH * ratio)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  return w
}

let frame = 0

function redraw() {
  if (!ready.value || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (stage.value) paint(stage.value, sizeCanvas(stage.value, VIEW_W, VIEW_H))
    if (previewMenu.value) paint(previewMenu.value, sizeCanvas(previewMenu.value, 40))
    if (previewTab.value) paint(previewTab.value, sizeCanvas(previewTab.value, 16))
  })
}

watch(zoom, () => {
  clampOffsets()
  redraw()
})

function zoomBy(step) {
  zoom.value = Math.min(100, Math.max(0, zoom.value + step))
}

function setFit() {
  offsetX = 0
  offsetY = 0
  zoom.value = 0
  redraw()
}

function setFill() {
  offsetX = 0
  offsetY = 0
  zoom.value = zoomFor(Math.max(VIEW_W / width, VIEW_H / height))
  redraw()
}

/* ---- moving: mouse, finger or pen; arrow keys ---- */
let dragFrom = null

function startDrag(event) {
  if (!ready.value) return
  stage.value.setPointerCapture(event.pointerId)
  dragFrom = { x: event.clientX, y: event.clientY, offsetX, offsetY }
}

function drag(event) {
  if (!dragFrom) return
  offsetX = dragFrom.offsetX + event.clientX - dragFrom.x
  offsetY = dragFrom.offsetY + event.clientY - dragFrom.y
  clampOffsets()
  redraw()
}

function endDrag() {
  dragFrom = null
}

function onKey(event) {
  const moves = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }
  if (moves[event.key]) {
    event.preventDefault()
    offsetX += moves[event.key][0]
    offsetY += moves[event.key][1]
    clampOffsets()
    redraw()
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(4)
  } else if (event.key === '-') {
    event.preventDefault()
    zoomBy(-4)
  }
}

// the mouse wheel zooms (not passive: it must not scroll the page)
function onWheel(event) {
  if (!ready.value) return
  event.preventDefault()
  zoomBy(event.deltaY < 0 ? 4 : -4)
}

/* ---- loading the picture ---- */
let objectUrl = ''

onMounted(async () => {
  stage.value?.addEventListener('wheel', onWheel, { passive: false })

  try {
    objectUrl = URL.createObjectURL(props.file)
    const img = new Image()
    img.src = objectUrl
    await img.decode()

    width = img.naturalWidth
    height = img.naturalHeight
    if (width < 32 || height < 32) throw new Error('small')

    // shrink a very big photo once, so dragging doesn't redraw megapixels
    const biggest = Math.max(width, height)
    if (biggest > MAX_SOURCE) {
      const k = MAX_SOURCE / biggest
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * k)
      canvas.height = Math.round(height * k)
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      source = canvas
      width = canvas.width
      height = canvas.height
    } else {
      source = img
    }

    fitScale = Math.min(VIEW_W / width, VIEW_H / height)
    maxScale = Math.max(VIEW_W / width, VIEW_H / height) * 4
    ready.value = true
    // a photo starts filling the frame; a logo starts whole
    if (!isLogo) zoom.value = zoomFor(Math.max(VIEW_W / width, VIEW_H / height))
    await nextTick()
    redraw()
    stage.value?.focus()
  } catch (error) {
    loadError.value =
      error?.message === 'small'
        ? `This picture is too small${isLogo ? ' for a logo' : ''}. Pick one at least 32 × 32 pixels.`
        : "This picture can't be opened. Pick a PNG, JPG or WebP picture."
  }
})

onBeforeUnmount(() => {
  stage.value?.removeEventListener('wheel', onWheel)
  if (frame) cancelAnimationFrame(frame)
  if (objectUrl) URL.revokeObjectURL(objectUrl)
})

/* ---- the result: a square PNG (WebP if the PNG is too big) ---- */
function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function finish() {
  if (!ready.value || busy.value) return
  busy.value = true
  saveError.value = ''

  try {
    const canvas = document.createElement('canvas')
    canvas.width = OUT_W
    canvas.height = OUT_H

    // a product photo: a JPEG on white
    if (!isLogo) {
      paint(canvas, OUT_W, OUT_H, '#ffffff')
      let photo = await toBlob(canvas, 'image/jpeg', 0.88)
      if (photo && photo.size > PHOTO_MAX_BYTES) photo = await toBlob(canvas, 'image/jpeg', 0.7)
      if (!photo) throw new Error("The picture couldn't be made. Try another one.")
      emit('done', photo)
      return
    }

    paint(canvas, OUT_W, OUT_H)

    let blob = await toBlob(canvas, 'image/png')
    // a detailed photo can make a big PNG: WebP keeps it small (and see-through)
    if (blob && blob.size > LOGO_MAX_BYTES) blob = await toBlob(canvas, 'image/webp', 0.9)

    if (!blob) throw new Error("The logo couldn't be made. Try another picture.")
    if (blob.size > LOGO_MAX_BYTES) throw new Error('This logo is still over 1 MB after cropping. Try a simpler picture.')

    emit('done', blob)
  } catch (error) {
    saveError.value = error.message
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.stage {
  flex: none;
  cursor: grab;
  touch-action: none;
  border-radius: 1rem;
  outline-offset: 3px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
  /* see-through parts show as a checkerboard */
  background-color: #1e1e24;
  background-image:
    linear-gradient(45deg, #2a2a32 25%, transparent 25%),
    linear-gradient(-45deg, #2a2a32 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #2a2a32 75%),
    linear-gradient(-45deg, transparent 75%, #2a2a32 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}

.stage:active {
  cursor: grabbing;
}

.zoom-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.7rem;
  background: var(--color-zinc-800);
  font-size: 1.1rem;
  font-weight: 800;
  color: #fff;
}

.fit-btn {
  flex: none;
  border-radius: 0.7rem;
  border: 1px solid var(--hairline);
  padding: 0.45rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-zinc-300);
}

.fit-btn:hover,
.zoom-btn:hover {
  color: #fff;
  border-color: rgba(224, 27, 50, 0.45);
}

.zoom-btn:disabled,
.fit-btn:disabled {
  opacity: 0.5;
}
</style>
