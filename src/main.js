// first: must see a password-reset link before Supabase removes it from the URL
import './lib/passwordRecovery'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { blockInspect } from './lib/inspectGuard'
import { vNoSave } from './lib/noSavePassword'
import './style.css'

// The live site: no right-click menu or developer-tools keys (F12…) on any
// page, for every role (see lib/inspectGuard.js). Not while developing.
if (import.meta.env.PROD) blockInspect()

// v-no-save: password boxes the browser doesn't offer to save
createApp(App).use(router).directive('no-save', vNoSave).mount('#app')