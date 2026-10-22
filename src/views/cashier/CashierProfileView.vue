<template>
  <div>
    <PageHeader title="Cashier Profile" subtitle="Your account details and password." />

    <!-- same profile as staff (read-only details, password); sales are on
         the Sales History page -->
    <MyProfile />
  </div>
</template>

<script setup>
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'
</script>
