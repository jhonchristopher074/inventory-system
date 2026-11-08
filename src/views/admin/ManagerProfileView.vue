<template>
  <!-- A Manager's Profile: his own account and password, and the store's
       logo. The accounts list (Profile & Users) is the Owner's only. -->
  <div>
    <PageHeader title="Profile" subtitle="Your account details and password." />

    <div class="grid grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <StoreLogoCard />
      <MyProfile />
    </div>
  </div>
</template>

<script setup>
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'
import StoreLogoCard from '../../components/StoreLogoCard.vue'
</script>
