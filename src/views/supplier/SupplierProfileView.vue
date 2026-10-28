<template>
  <div>
    <PageHeader title="Supplier Profile" subtitle="Your account details and password." />

    <!-- same profile as staff and cashier (read-only details, password);
         uploads are on the Dashboard's My uploads tab -->
    <MyProfile />
  </div>
</template>

<script setup>
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'
</script>
