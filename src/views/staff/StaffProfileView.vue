<template>
  <div>
    <PageHeader
      title="Profile"
      subtitle="Your account details and password."
    />

    <MyProfile :stats="stats" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'

const documentationCount = ref(0)
const reportCount = ref(0)

// shown on the profile under "Your activity"
const stats = computed(() => [
  { label: 'Documentation records', value: documentationCount.value, icon: 'docs' },
  { label: 'Product reports', value: reportCount.value, icon: 'inventory' },
])

onMounted(fetchStats)

async function fetchStats() {
  const currentUser = JSON.parse(
    localStorage.getItem('currentUser') || '{}'
  )

  // The server returns only the logged-in user's own documents; the name is
  // only still sent for databases that haven't had the 2026-10-15 SQL yet.
  const { data } = await supabase.rpc('list_documentations_by_author', {
    p_created_by: currentUser.full_name || currentUser.email,
  })

  const docs = data || []

  documentationCount.value = docs.length

  reportCount.value = docs.filter(
    doc => doc.type === 'Product Report'
  ).length
}
</script>
