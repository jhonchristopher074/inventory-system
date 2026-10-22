<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- dashboard -->
    <template v-if="name === 'dashboard'">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </template>

    <!-- inventory -->
    <template v-else-if="name === 'inventory'">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </template>

    <!-- archived -->
    <template v-else-if="name === 'archive'">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" />
    </template>

    <!-- point of sale -->
    <template v-else-if="name === 'pos'">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </template>

    <!-- sales history -->
    <template v-else-if="name === 'sales'">
      <path d="M3 3v18h18" />
      <path d="M7 14l3.5-4 3 3L20 7" />
    </template>

    <!-- calendar -->
    <template v-else-if="name === 'calendar'">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </template>

    <!-- approval -->
    <template v-else-if="name === 'approval'">
      <path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" />
      <path d="M8 6H6a1 1 0 00-1 1v13a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2" />
      <path d="M9 13l2 2 4-4" />
    </template>

    <!-- documentation -->
    <template v-else-if="name === 'docs'">
      <path d="M14 3H7a1 1 0 00-1 1v16a1 1 0 001 1h10a1 1 0 001-1V7l-4-4z" />
      <path d="M14 3v4h4M9 13h6M9 17h4" />
    </template>

    <!-- profile -->
    <template v-else-if="name === 'profile'">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-1a5 5 0 015-5h4a5 5 0 015 5v1" />
    </template>

    <!-- logout -->
    <template v-else-if="name === 'logout'">
      <path d="M15 17l5-5-5-5M20 12H9M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h5" />
    </template>

    <!-- lock (read-only) -->
    <template v-else-if="name === 'lock'">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </template>

    <!-- key (password) -->
    <template v-else-if="name === 'key'">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L20 3M16.5 6.5L19 9M14 9l2 2" />
    </template>

    <!-- check in a circle (status) -->
    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16 9.5" />
    </template>

    <!-- hash (account number) -->
    <template v-else-if="name === 'hash'">
      <path d="M5 9h14M5 15h14M10 3L8 21M16 3l-2 18" />
    </template>

    <!-- fallback dot -->
    <circle v-else cx="12" cy="12" r="3" />
  </svg>
</template>

<script setup>
defineProps({
  name: { type: String, default: '' },
})
</script>
