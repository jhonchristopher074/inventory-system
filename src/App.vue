<template>
  <div class="min-h-screen bg-black text-white">
    <div class="grid min-h-screen grid-cols-[270px_1fr]">
      
      <!-- SIDEBAR -->
      <aside
        class="sticky top-0 h-screen border-r border-white/5 bg-gradient-to-b from-[#1b0909] to-[#0c0c0c] p-5"
      >
        <!-- LOGO -->
        <div
          class="mb-6 rounded-3xl border border-white/10 bg-gradient-to-br from-red-500/20 to-white/5 p-4"
        >
          <h1 class="text-4xl font-extrabold text-red-500">Hardware</h1>
          <p class="mt-1 text-sm text-zinc-400">Inventory Management System</p>
        </div>

        <!-- NAVIGATION -->
        <nav class="flex flex-col gap-2">

          <RouterLink
            to="/"
            class="block rounded-2xl px-4 py-3 font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            active-class="bg-red-600 text-white"
          >
            Dashboard
          </RouterLink>

          <RouterLink
            to="/inventory"
            class="block rounded-2xl px-4 py-3 font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            active-class="bg-red-600 text-white"
          >
            Inventory
          </RouterLink>

          <RouterLink
            to="/calendar"
            class="block rounded-2xl px-4 py-3 font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            active-class="bg-red-600 text-white"
          >
            Calendar
          </RouterLink>

          <!-- UPDATED -->
          <RouterLink
            to="/documentation"
            class="block rounded-2xl px-4 py-3 font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            active-class="bg-red-600 text-white"
          >
            Documentation
          </RouterLink>

          <!-- UPDATED -->
          <RouterLink
            to="/archived"
            class="block rounded-2xl px-4 py-3 font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            active-class="bg-red-600 text-white"
          >
            Archived
          </RouterLink>

          <RouterLink
            to="/profile"
            class="block rounded-2xl px-4 py-3 font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            active-class="bg-red-600 text-white"
          >
            Profile
          </RouterLink>

        </nav>
      </aside>

      <!-- MAIN CONTENT -->
      <main class="bg-black p-7">
        <div class="mb-5 flex justify-end">
          <NotificationBell />
        </div>
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup>
import NotificationBell from './components/NotificationBell.vue'
</script>

<style>
</style>