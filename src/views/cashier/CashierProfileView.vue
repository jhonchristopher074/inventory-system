<template>
  <div>
    <PageHeader title="Profile" />

    <!-- same profile as staff (read-only details, password); sales are on
         the Sales History page -->
    <MyProfile />
  </div>
</template>

<script setup>
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'
</script>
