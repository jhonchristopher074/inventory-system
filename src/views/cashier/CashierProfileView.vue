<template>
  <div>
    <PageHeader title="Cashier Profile" subtitle="Your account details, password and sales." />

    <!-- TABS -->
    <div class="mb-5 flex gap-3 card p-2">
      <button
        class="rounded-2xl px-5 py-3 font-bold transition"
        :class="activeTab === 'profile'
          ? 'bg-red-600 text-white'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="activeTab = 'profile'"
      >
        Profile Settings
      </button>

      <button
        class="rounded-2xl px-5 py-3 font-bold transition"
        :class="activeTab === 'sales'
          ? 'bg-red-600 text-white'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="openSalesTab"
      >
        Sales History
      </button>
    </div>

    <!-- PROFILE SETTINGS: same profile as staff (photo, read-only details, password) -->
    <MyProfile v-if="activeTab === 'profile'" role-label="CASHIER ACCOUNT" />

    <!-- SALES HISTORY: the same view as the Sales History page (date filter,
         totals, every sale with its receipt) -->
    <SalesHistoryView v-if="activeTab === 'sales'" embedded />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'
import SalesHistoryView from './SalesHistoryView.vue'

const activeTab = ref('profile')

function openSalesTab() {
  activeTab.value = 'sales'
}
</script>