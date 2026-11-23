<template>
  <!-- A receipt is still being read by the scanner (lib/receiptScans.js):
       a small button on every page but Approval (which shows the steps).
       It opens Approval and its steps. -->
  <button
    v-if="scans.length > 0 && route.path !== '/approval'"
    type="button"
    class="above-tabbar fixed bottom-4 right-4 z-[1900] flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-zinc-900/95 py-2.5 pl-3 pr-4 text-left text-white shadow-2xl backdrop-blur hover:border-emerald-500/50"
    title="Show the steps"
    @click="router.push('/approval')"
  >
    <svg class="h-6 w-6 shrink-0 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
    <span class="leading-tight">
      <span class="block text-sm font-bold">Processing receipt…</span>
      <span class="block max-w-[14rem] truncate text-xs text-zinc-400">
        {{ scans.length === 1 ? scans[0].name : `${scans.length} receipts` }} · tap to see the steps
      </span>
    </span>
  </button>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { scans } from '../lib/receiptScans'

const route = useRoute()
const router = useRouter()
</script>
