import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // '/' for the live site; the test copy sets VITE_BASE=/inventory-system/
  // (.github/workflows/staging.yml, docs/STAGING.md)
  base: process.env.VITE_BASE || '/',
  plugins: [vue()],
  build: {
    // The Excel library (exceljs, ~930 kB) is its own file, downloaded only
    // when Sales History's Excel button is pressed. The limit sits just above
    // it, so any other file growing that big still gets a warning.
    chunkSizeWarningLimit: 1000,
  },
})
