// first: must see a password-reset link before Supabase removes it from the URL
import './lib/passwordRecovery'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { blockInspect } from './lib/inspectGuard'
import { passwordType, vNoSave } from './lib/noSavePassword'
import { guardNumbers } from './lib/numberGuard'
import './style.css'

// the test copy (docs/STAGING.md) says so on every page, so nobody takes it
// for the real store
if (import.meta.env.VITE_TEST_COPY) {
  document.title = `[TEST] ${document.title}`
  const ribbon = document.createElement('div')
  ribbon.textContent = 'TEST COPY · not the real store'
  ribbon.style.cssText =
    'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;' +
    'background:#f59e0b;color:#111;font:800 11px/1 system-ui,sans-serif;letter-spacing:.08em;' +
    'padding:6px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.45)'
  document.body.appendChild(ribbon)
}

// every number box: digits only, no leading zeros, a maximum (lib/numberGuard.js)
guardNumbers()

// The live site: no right-click menu or developer-tools keys (F12…) on any
// page, for every role (see lib/inspectGuard.js). Not while developing.
if (import.meta.env.PROD) blockInspect()

// v-no-save and $passwordType: password boxes the browser doesn't offer to
// save (lib/noSavePassword.js)
const app = createApp(App)
app.config.globalProperties.$passwordType = passwordType
app.use(router).directive('no-save', vNoSave).mount('#app')