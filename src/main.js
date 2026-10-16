// first: must see a password-reset link before Supabase removes it from the URL
import './lib/passwordRecovery'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

createApp(App).use(router).mount('#app')