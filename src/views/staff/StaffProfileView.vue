<template>
  <div>
    <PageHeader
      title="Profile"
      subtitle="Your account details and password."
    />

    <MyProfile role-label="STAFF ACCOUNT">
      <template #stats>
        <div class="rounded-2xl bg-black p-4">
          <p class="text-sm text-zinc-400">
            Documentation Records
          </p>

          <h3 class="mt-2 text-3xl font-black text-white">
            {{ documentationCount }}
          </h3>
        </div>

        <div class="rounded-2xl bg-black p-4">
          <p class="text-sm text-zinc-400">
            Product Reports
          </p>

          <h3 class="mt-2 text-3xl font-black text-white">
            {{ reportCount }}
          </h3>
        </div>
      </template>
    </MyProfile>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'

const documentationCount = ref(0)
const reportCount = ref(0)

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
