import { supabase } from './supabase'

/**
 * Shared image upload for the product and document photo pickers.
 *
 * Before this existed each screen did its own upload, and none of them
 * checked what was being uploaded — any file of any size went straight
 * into the bucket, and the Inventory screen used the visitor's own
 * filename, so "my photo (1).jpg" produced a URL with spaces in it.
 *
 * Throws an Error with a message meant for the user; callers show it.
 */

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

/**
 * Makes a smaller JPEG copy of an image: the longest side at most maxSide
 * pixels. A phone photo of several MB becomes about 50–150 KB. Returns the
 * original file if the browser can't read it (the normal checks then apply).
 */
async function shrinkImage(file, maxSide) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#18181b' // transparent parts of a PNG: dark, like the app
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

/**
 * @param {File}   file              the picked file
 * @param {object} options
 * @param {string} options.bucket    storage bucket name ('products' | 'documents')
 * @param {string} [options.folder]  optional folder inside the bucket
 * @param {number} [options.maxBytes]  largest file accepted (default 5 MB)
 * @param {number} [options.maxSide]   shrink to at most this many pixels per side first
 * @returns {Promise<string>}        public URL of the uploaded image
 */
export async function uploadImage(file, { bucket, folder = '', maxBytes = MAX_BYTES, maxSide = 0 } = {}) {
  if (!file) {
    throw new Error('Please choose an image first.')
  }

  if (!bucket) {
    throw new Error('Upload failed: no storage bucket was specified.')
  }

  // 1. type — the browser reports the real MIME type, so a .exe renamed
  //    to .jpg is still rejected here
  const extension = ALLOWED_TYPES[file.type]

  if (!extension) {
    throw new Error('That file is not an image. Please use a JPG, PNG, WEBP or GIF.')
  }

  // 2. size
  if (file.size > maxBytes) {
    throw new Error(
      `That image is ${formatSize(file.size)}. Please use one under ${formatSize(maxBytes)}.`
    )
  }

  if (file.size === 0) {
    throw new Error('That file is empty. Please choose another image.')
  }

  // 3. optional: a smaller copy (e.g. profile photos only show small)
  let fileExtension = extension
  if (maxSide > 0) {
    file = await shrinkImage(file, maxSide)
    fileExtension = ALLOWED_TYPES[file.type] || extension
  }

  // 4. build our own filename — never trust the one from the device.
  //    Timestamp keeps uploads roughly ordered, the random suffix stops
  //    two people uploading in the same millisecond from colliding.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const path = folder ? `${folder}/${unique}.${fileExtension}` : `${unique}.${fileExtension}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path)

  if (!publicUrl) {
    throw new Error('Upload succeeded but no public URL was returned.')
  }

  return publicUrl
}

/**
 * Removes an already-uploaded image. Used when the row it belonged to
 * could not be saved, so the bucket doesn't collect orphaned files.
 * Never throws — cleanup failing must not mask the original error.
 */
export async function removeUploadedImage(publicUrl, bucket) {
  if (!publicUrl || !bucket) return

  try {
    const marker = `/object/public/${bucket}/`
    const index = publicUrl.indexOf(marker)

    if (index === -1) return

    const path = publicUrl.slice(index + marker.length)
    await supabase.storage.from(bucket).remove([path])
  } catch {
    // best effort only
  }
}