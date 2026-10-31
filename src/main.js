// first: must see a password-reset link before Supabase removes it from the URL
import './lib/passwordRecovery'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { blockInspect } from './lib/inspectGuard'
import './style.css'

// The live site: no right-click menu or developer-tools keys (F12…) on any
// page, for every role (see lib/inspectGuard.js). Not while developing.
if (import.meta.env.PROD) blockInspect()

createApp(App).use(router).mount('#app')