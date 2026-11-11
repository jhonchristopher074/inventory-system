// The store's logo: the Owner's uploaded one (Profile page) or the
// built-in one (public/logo.svg). Shown in the sidebar, on the login page
// and as the browser-tab icon.
//
// The uploaded file lives in the public "branding" bucket; its name comes
// from get_store_logo() (supabase/migrations/20261101000002_store_logo.sql).
// The last one seen is remembered in this browser, so the page doesn't
// flash the built-in logo before switching. Until that SQL is run,
// get_store_logo() fails and the built-in logo stays.
import { ref } from 'vue'
import { supabase } from './supabase'
import { appUrl } from './appUrl'

export const LOGO_BUCKET = 'branding'
export const DEFAULT_LOGO = appUrl('logo.svg')

// what the Owner may pick, and how big the cropped logo may be (the bucket
// refuses anything over 1 MB too)
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
// the picture picked: up to 10 MB (it's cropped and shrunk to LOGO_SIZE
// before upload, so what's stored stays small)
export const LOGO_MAX_INPUT_BYTES = 10 * 1024 * 1024
export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_SIZE = 512 // px, square

const CACHE_KEY = 'storeLogoPath'

function cachedPath() {
  try {
    return localStorage.getItem(CACHE_KEY) || ''
  } catch {
    return ''
  }
}

export function logoUrlFor(path) {
  return path ? supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl : DEFAULT_LOGO
}

// the file name of the current logo ('' = built-in) and its address
export const logoPath = ref(cachedPath())
export const logoUrl = ref(logoUrlFor(logoPath.value))

// Points the browser-tab icons at the logo. The .ico (old browsers) stays.
function applyTabIcon(url, isDefault) {
  const icon = document.querySelector('link[rel="icon"][data-logo]') || document.querySelector('link[rel="icon"][type="image/svg+xml"]')
  if (icon) {
    icon.setAttribute('data-logo', '')
    icon.type = isDefault ? 'image/svg+xml' : ''
    icon.href = url
  }

  const touch = document.querySelector('link[rel="apple-touch-icon"]')
  if (touch) touch.href = isDefault ? appUrl('apple-touch-icon.png') : url
}

export function setLogoPath(path) {
  logoPath.value = path || ''
  logoUrl.value = logoUrlFor(logoPath.value)

  try {
    if (logoPath.value) localStorage.setItem(CACHE_KEY, logoPath.value)
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // storage blocked: the logo just loads a moment later next time
  }

  applyTabIcon(logoUrl.value, !logoPath.value)
}

// An <img> whose logo didn't load (e.g. changed on another computer since
// this browser saw it): show the built-in one instead.
export function showDefaultLogo(event) {
  const img = event?.target
  if (img && !img.src.endsWith(DEFAULT_LOGO)) img.src = DEFAULT_LOGO
}

// Once per page load (App.vue). A failure (no internet, SQL not run yet)
// keeps whatever is shown.
let loading = null

export function loadStoreLogo() {
  if (!loading) {
    if (logoPath.value) applyTabIcon(logoUrl.value, false)

    loading = supabase.rpc('get_store_logo').then(({ data, error }) => {
      if (error) {
        console.warn('Store logo: using the built-in one.', error.message)
        return
      }
      setLogoPath(data || '')
    })
  }
  return loading
}
