<template>
  <div>
    <PageHeader title="To-Do List" subtitle="Products scheduled for inspection and delivery." />

    <!-- List: the Inspection / Delivery tabs. Month: both on a calendar,
         each shown or hidden with its toggle. The add button on the right. -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div v-if="view === 'list'" class="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/5 bg-zinc-900 p-1">
        <button
          type="button"
          class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition"
          :class="activeTab === 'inspection' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'"
          :aria-pressed="activeTab === 'inspection'"
          @click="activeTab = 'inspection'"
        >
          Inspection
          <span
            v-if="taskBadges.tabs['admin:inspection']"
            class="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-extrabold"
            :class="activeTab === 'inspection' ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
            :title="'Inspections overdue'"
          >{{ taskBadges.tabs['admin:inspection'] }}</span>
        </button>
        <button
          type="button"
          class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition"
          :class="activeTab === 'delivery' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'"
          :aria-pressed="activeTab === 'delivery'"
          @click="activeTab = 'delivery'"
        >
          Delivery
          <span
            v-if="taskBadges.tabs['admin:delivery']"
            class="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-extrabold"
            :class="activeTab === 'delivery' ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
            :title="'Deliveries overdue'"
          >{{ taskBadges.tabs['admin:delivery'] }}</span>
        </button>
      </div>

      <div v-else class="flex flex-wrap items-center gap-2" role="group" aria-label="Show on the calendar">
        <button
          v-for="kind in KINDS"
          :key="kind.key"
          type="button"
          class="kind-toggle"
          :class="[`kind-${kind.key}`, { 'is-off': !showKinds[kind.key] }]"
          :aria-pressed="showKinds[kind.key]"
          @click="showKinds[kind.key] = !showKinds[kind.key]"
        >
          <span class="kind-dot" aria-hidden="true"></span>
          {{ kind.label }}
          <span class="text-xs opacity-70">{{ kindCounts[kind.key] }}</span>
        </button>
        <span class="flex items-center gap-1.5 text-xs text-zinc-400">
          <span class="h-2 w-2 rounded-full bg-[#ff9500]" aria-hidden="true"></span> Overdue
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <!-- List / Month, remembered in the address (?view=month) -->
        <div class="inline-flex gap-1 rounded-2xl border border-white/5 bg-zinc-900 p-1" role="group" aria-label="View">
          <button
            v-for="option in VIEWS"
            :key="option.key"
            type="button"
            class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition"
            :class="view === option.key ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'"
            :aria-pressed="view === option.key"
            @click="view = option.key"
          >
            <NavIcon :name="option.icon" class="h-4 w-4" />
            {{ option.label }}
          </button>
        </div>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-900/40 transition hover:bg-red-700"
          :title="activeTab === 'delivery' ? 'Schedule a delivery' : 'Schedule an inspection'"
          @click="openAddModal()"
        >
          <span class="text-base leading-none">+</span>
          {{ view === 'month' ? 'Add schedule' : `Add ${activeTab === 'delivery' ? 'delivery' : 'inspection'}` }}
        </button>
      </div>
    </div>

    <!-- MONTH: inspections and deliveries on a wall calendar -->
    <MonthCalendar
      v-if="view === 'month'"
      v-model:month="calMonth"
      :events="monthEvents"
      :today="getToday()"
      @pick="openDay"
    />

    <p v-if="loading && view === 'list' && activeTab === 'delivery'" class="text-sm text-zinc-400">Loading...</p>
    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">{{ errorMessage }}</p>

    <!-- INSPECTION: one table row per product; Details opens the small window below -->
    <InspectionTable
      v-if="view === 'list' && activeTab === 'inspection'"
      :rows="inspectionRows"
      :loading="loading"
      action-label="Details"
      storage-key="inspections"
      @open="openPanel"
    />

    <!-- DELIVERY -->
    <div v-if="view === 'list' && activeTab === 'delivery'">
      <!-- nothing yet: the way to add one, right here -->
      <div
        v-if="deliveries.length === 0"
        class="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/15 bg-zinc-900 px-5 py-10 text-center"
      >
        <p class="font-bold text-white">No deliveries scheduled</p>
        <p class="max-w-sm text-sm text-zinc-400">
          Expecting goods from a supplier? Add the delivery so the staff know when it comes.
        </p>
        <button
          type="button"
          class="mt-1 rounded-2xl bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700"
          @click="openAddModal()"
        >
          + Add delivery
        </button>
      </div>

      <div v-else class="grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,260px)]">
        <div
          v-for="delivery in deliveries"
          :key="delivery.id"
          class="rounded-[22px] border border-white/10 bg-zinc-900 p-5 shadow-xl"
          :class="isDeliveryOverdue(delivery) ? 'border-red-500/70 bg-red-950/30 shadow-red-500/20' : ''"
        >
          <h2 class="text-xl font-bold text-white">{{ delivery.title }}</h2>

          <p class="mt-3 text-sm text-zinc-400">
            Supplier: {{ delivery.supplier || 'No supplier' }}
          </p>

          <p class="mt-2 text-sm font-bold text-red-400">
            {{ formatDate(delivery.delivery_date) }}
          </p>

          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span
              v-if="receiptStateOf(delivery)"
              class="rounded-full px-3 py-1 text-xs font-bold"
              :class="receiptStateOf(delivery).tone"
            >
              {{ receiptStateOf(delivery).text }}
            </span>
            <span v-else class="text-sm text-emerald-400">{{ delivery.status || 'Scheduled' }}</span>
            <span
              v-if="isDeliveryOverdue(delivery)"
              class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400"
            >
              Overdue
            </span>
          </div>

          <!-- arrived without its receipt: no stock until it's in -->
          <template v-if="delivery.receipt_state === 'waiting'">
            <p class="mt-3 text-xs text-amber-200/80">
              No stock is added until its receipt is in. When the supplier sends it, link it in Approval, or upload it here.
            </p>
            <RouterLink
              :to="{ path: '/approval', query: { receiptFor: delivery.id } }"
              class="mt-3 block w-full rounded-xl bg-amber-500 py-2 text-center text-sm font-bold text-black hover:bg-amber-400"
            >
              Add receipt
            </RouterLink>
          </template>
          <p v-else-if="delivery.receipt_state === 'sent'" class="mt-3 text-xs text-zinc-500">
            Its receipt <b class="text-zinc-300">{{ delivery.receipt_file }}</b> is in Approval.
          </p>

          <!-- delete (not once a receipt is linked to it): asks first, here -->
          <template v-if="!delivery.upload_id">
            <div v-if="deletingId === delivery.id" class="mt-4 rounded-xl border border-red-500/40 bg-red-600/10 p-3">
              <p class="text-sm font-bold text-red-200">Delete this delivery?</p>
              <p class="mt-0.5 text-xs text-zinc-400">It leaves the list and the staff are told.</p>
              <p v-if="deleteError" class="mt-2 text-xs text-red-300" role="alert">{{ deleteError }}</p>
              <div class="mt-3 flex gap-2">
                <button
                  type="button"
                  class="flex-1 rounded-lg bg-zinc-800 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                  :disabled="deleteBusy"
                  @click="deletingId = null"
                >
                  Keep
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  :disabled="deleteBusy"
                  @click="deleteDelivery(delivery)"
                >
                  {{ deleteBusy ? 'Deleting…' : 'Yes, delete' }}
                </button>
              </div>
            </div>
            <button
              v-else
              type="button"
              class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2 text-sm font-bold text-zinc-300 transition hover:border-red-500/50 hover:bg-red-600/10 hover:text-red-300"
              :title="'Delete ' + delivery.title"
              @click="askDelete(delivery)"
            >
              Delete
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- ONE DAY (Month view): what's on it, with the same actions as the list -->
    <div
      v-if="pickedDay"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4"
      @click.self="pickedDay = null"
      @keydown.esc="pickedDay = null"
    >
      <div
        class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-title"
      >
        <header class="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.14em]" :class="pickedDay === getToday() ? 'text-red-400' : 'text-zinc-500'">
              {{ pickedDay === getToday() ? 'Today' : pickedDay < getToday() ? 'Past day' : 'Coming up' }}
            </p>
            <h2 id="day-title" class="text-xl font-extrabold text-white">{{ longDate(pickedDay) }}</h2>
          </div>
          <button
            type="button"
            class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close"
            @click="pickedDay = null"
          >
            ✕
          </button>
        </header>

        <div class="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          <p v-if="dayItems.length === 0" class="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-zinc-400">
            Nothing scheduled on this day.
          </p>

          <article
            v-for="event in dayItems"
            :key="event.key"
            class="rounded-xl border p-3.5"
            :class="event.state === 'overdue' ? 'border-[#ff9500]/45 bg-[#ff9500]/[0.06]' : 'border-white/10 bg-white/[0.03]'"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wider" :class="event.kind === 'inspection' ? 'text-violet-300' : 'text-sky-300'">
                  <NavIcon :name="event.kind === 'inspection' ? 'approval' : 'inventory'" class="h-3.5 w-3.5" />
                  {{ event.kind === 'inspection' ? 'Inspection' : 'Delivery' }}
                </p>
                <p class="mt-0.5 truncate font-bold text-white" :title="event.title">{{ event.title }}</p>
                <p class="text-xs text-zinc-400">{{ event.sub }}</p>
              </div>
              <span
                class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                :class="event.state === 'overdue' ? 'bg-[#ff9500]/20 text-[#ffb547]' : event.state === 'arrived' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/5 text-zinc-300'"
              >
                {{ event.badge }}
              </span>
            </div>

            <!-- inspection: how far it is, and its details -->
            <template v-if="event.kind === 'inspection'">
              <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div class="h-full rounded-full bg-violet-400" :style="{ width: totalProgressPercent(event.item) + '%' }"></div>
              </div>
              <div class="mt-3 flex justify-end">
                <button
                  type="button"
                  class="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                  @click="pickedDay = null; openPanel(event.item)"
                >
                  Details
                </button>
              </div>
            </template>

            <!-- delivery: its receipt, and delete -->
            <template v-else>
              <div v-if="deletingId === event.item.id" class="mt-3 rounded-lg border border-red-500/40 bg-red-600/10 p-3">
                <p class="text-sm font-bold text-red-200">Delete this delivery?</p>
                <p v-if="deleteError" class="mt-1 text-xs text-red-300" role="alert">{{ deleteError }}</p>
                <div class="mt-2 flex gap-2">
                  <button type="button" class="flex-1 rounded-lg bg-zinc-800 py-1.5 text-sm font-bold text-white hover:bg-zinc-700" :disabled="deleteBusy" @click="deletingId = null">Keep</button>
                  <button type="button" class="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50" :disabled="deleteBusy" @click="deleteDelivery(event.item)">
                    {{ deleteBusy ? 'Deleting…' : 'Yes, delete' }}
                  </button>
                </div>
              </div>
              <div v-else class="mt-3 flex flex-wrap justify-end gap-2">
                <RouterLink
                  v-if="event.item.receipt_state === 'waiting'"
                  :to="{ path: '/approval', query: { receiptFor: event.item.id } }"
                  class="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-black hover:bg-amber-400"
                >
                  Add receipt
                </RouterLink>
                <button
                  v-if="!event.item.upload_id"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-red-600/15 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30 hover:text-white"
                  @click="askDelete(event.item)"
                >
                  <NavIcon name="trash" class="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </template>
          </article>
        </div>

        <!-- a day to come: schedule something on it -->
        <footer v-if="pickedDay >= getToday()" class="flex flex-wrap justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            type="button"
            class="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700"
            @click="openAddModal({ date: pickedDay, type: 'delivery' })"
          >
            + Delivery on this day
          </button>
          <button
            type="button"
            class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            @click="openAddModal({ date: pickedDay, type: 'inspection' })"
          >
            + Inspection on this day
          </button>
        </footer>
      </div>
    </div>

    <!-- ADD SCHEDULE MODAL -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="closeAddModal"
    >
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#18181b] p-6 shadow-2xl">
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-extrabold text-white">Add Schedule</h2>
            <p class="text-sm text-zinc-400">Create inspection or delivery schedule.</p>
          </div>

          <button
            class="rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            @click="closeAddModal"
          >
            ✕
          </button>
        </div>

        <div class="space-y-4 rounded-3xl bg-black/40 p-5">
          <div>
            <label class="label">Schedule Type</label>
            <select v-model="newSchedule.type" class="input">
              <option value="inspection">Inspection</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          <div v-if="newSchedule.type === 'inspection'" class="space-y-4">
            <div>
              <label class="label">Product</label>

              <div class="relative">
                <button
                  type="button"
                  class="search-select-btn"
                  @click="showProductDropdown = !showProductDropdown"
                >
                  <span :class="productSearch ? 'text-white' : 'text-zinc-500'">
                    {{ productSearch || 'Search product...' }}
                  </span>

                  <span class="text-red-400">
                    {{ showProductDropdown ? '⌃' : '⌄' }}
                  </span>
                </button>

                <div v-if="showProductDropdown" class="search-select-menu">
                  <div class="search-box">
                    <span class="text-xl text-red-400">⌕</span>

                    <input
                      v-model="productSearch"
                      type="text"
                      maxlength="80"
                      placeholder="Search product..."
                      class="search-input"
                    />
                  </div>

                  <button
                    v-for="product in filteredAllProducts"
                    :key="product.id"
                    type="button"
                    class="search-item"
                    @click="selectProduct(product)"
                  >
                    <p class="font-bold text-white">{{ product.name }}</p>
                    <p class="text-xs text-zinc-400">
                      {{ product.category || 'Uncategorized' }}
                    </p>
                  </button>

                  <div
                    v-if="filteredAllProducts.length === 0"
                    class="px-4 py-3 text-sm text-zinc-400"
                  >
                    No product found.
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label class="label">Schedule Date</label>
              <!-- today or later: a schedule in the past would be overdue at once -->
              <input v-model="newSchedule.date" type="date" :min="getToday()" class="calendar-date-input" />
            </div>
          </div>

          <div v-if="newSchedule.type === 'delivery'" class="space-y-4">
            <div>
              <label class="label">Delivery Title</label>
              <input
                v-model="newSchedule.title"
                type="text"
                maxlength="100"
                placeholder="What's being delivered, e.g. 50 bags of cement"
                class="input"
              />
            </div>

            <div>
              <label class="label">Supplier</label>
              <input
                v-model="newSchedule.supplier"
                type="text"
                maxlength="100"
                placeholder="Who delivers it, e.g. JM Supply"
                class="input"
              />
            </div>

            <div>
              <label class="label">Delivery Date</label>
              <input v-model="newSchedule.date" type="date" :min="getToday()" class="calendar-date-input" />
            </div>
          </div>
        </div>

        <p v-if="modalError" class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400">
          {{ modalError }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-2xl bg-zinc-800 px-8 py-3 font-bold text-white hover:bg-zinc-700"
            @click="closeAddModal"
          >
            Cancel
          </button>

          <button
            class="rounded-2xl bg-red-600 px-10 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="scheduleSaving"
            @click="saveSchedule"
          >
            {{ scheduleSaving ? 'Saving...' : 'Save Schedule' }}
          </button>
        </div>
      </div>
    </div>

    <!-- INSPECTION DETAILS: only what the table row doesn't show
         (who submitted or saved how much) -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePanel"
      @keydown.esc="closePanel"
    >
      <div
        class="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspection-title"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="inspection-title" class="text-xl font-bold text-white">
              {{ selectedProduct.name }}
            </h2>
            <p class="text-sm text-zinc-400">
              Inspection {{ formatDate(selectedProduct.inspection_date) }} ·
              batch of {{ count(inspectionQty(selectedProduct)) }}
            </p>
          </div>

          <button
            ref="panelClose"
            type="button"
            class="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="closePanel"
          >
            ✕
          </button>
        </div>

        <!-- approved by the admin so far -->
        <div class="mb-4 flex flex-wrap gap-2 text-xs font-bold">
          <span class="rounded-full bg-emerald-600/20 px-3 py-1 text-emerald-400">
            Approved: {{ count(selectedProduct.approved_count) }}
          </span>
          <span class="rounded-full bg-red-600/20 px-3 py-1 text-red-400">
            Return: {{ count(selectedProduct.return_count) }}
          </span>
        </div>

        <h3 class="mb-2 text-xs font-bold uppercase tracking-wider text-yellow-400">
          Waiting for your approval ({{ selectedProductSubmittedList.length }})
        </h3>

        <ul v-if="selectedProductSubmittedList.length > 0" class="mb-4 space-y-1.5">
          <li
            v-for="approval in selectedProductSubmittedList"
            :key="approval.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-black px-3 py-2 text-sm"
          >
            <span class="min-w-0 truncate text-white">{{ approval.requested_by || 'Staff' }}</span>
            <span class="shrink-0 text-zinc-300">
              Approved {{ count(approval.approved_qty) }} · Return {{ count(approval.return_qty) }}
            </span>
          </li>
        </ul>
        <p v-else class="mb-4 text-sm text-zinc-500">Nothing to approve.</p>

        <h3 class="mb-2 text-xs font-bold uppercase tracking-wider text-lime-400">
          Saved by staff, not submitted yet ({{ selectedProductSavedList.length }})
        </h3>

        <ul v-if="selectedProductSavedList.length > 0" class="mb-5 space-y-1.5">
          <li
            v-for="approval in selectedProductSavedList"
            :key="approval.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-black px-3 py-2 text-sm"
          >
            <span class="min-w-0 truncate text-white">{{ approval.requested_by || 'Staff' }}</span>
            <span class="shrink-0 text-zinc-300">
              Approved {{ count(approval.approved_qty) }} · Return {{ count(approval.return_qty) }}
            </span>
          </li>
        </ul>
        <p v-else class="mb-5 text-sm text-zinc-500">None.</p>

        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            class="flex-1 rounded-xl bg-yellow-600 py-2.5 text-sm font-bold text-white hover:bg-yellow-700"
            @click="$router.push('/approval')"
          >
            Go to Approval Page
          </button>

          <button
            class="flex-1 rounded-xl bg-zinc-800 py-2.5 text-sm font-bold text-white hover:bg-zinc-700"
            @click="closePanel"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { refreshTasksSoon, taskBadges } from '../../lib/taskCounts'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import InspectionTable from '../../components/InspectionTable.vue'
import { count } from '../../lib/format'
import { isDelivered, isOpenDelivery, receiptStateOf } from '../../lib/deliveries'
import { RouterLink } from 'vue-router'
import { useQueryParam } from '../../lib/useQueryParam'
import { toast } from '../../lib/toast'
import MonthCalendar from '../../components/MonthCalendar.vue'
import NavIcon from '../../components/NavIcon.vue'

// in the address (?tab=delivery), like the Staff calendar, so the Dashboard
// can open the Delivery tab
const activeTab = useQueryParam('tab', 'inspection', ['inspection', 'delivery'])

// ----- List / Month -----
// remembered in the address (?view=month), so a refresh keeps it
const view = useQueryParam('view', 'list', ['list', 'month'])
const VIEWS = [
  { key: 'list', label: 'List', icon: 'docs' },
  { key: 'month', label: 'Month', icon: 'calendar' },
]
const KINDS = [
  { key: 'inspection', label: 'Inspections' },
  { key: 'delivery', label: 'Deliveries' },
]
const showKinds = ref({ inspection: true, delivery: true })
const calMonth = ref(getToday().slice(0, 7)) // 'YYYY-MM' shown in Month
const pickedDay = ref(null) // 'YYYY-MM-DD' open in the day window

const products = ref([])
const allProducts = ref([])
const deliveries = ref([])
const approvals = ref([])

// a schedule added or changed here: the menu's numbers follow
watch([products, deliveries, approvals], () => refreshTasksSoon())

const loading = ref(false)
const errorMessage = ref('')

const showAddModal = ref(false)
const modalError = ref('')

const newSchedule = ref({
  type: 'inspection',
  product_id: '',
  title: '',
  supplier: '',
  date: '',
})

const selectedProduct = ref(null)
const panelError = ref('')

const productSearch = ref('')
const showProductDropdown = ref(false)

// One row of the inspection table per scheduled product (see InspectionTable)
const inspectionRows = computed(() =>
  products.value.map(item => ({
    item,
    date: item.inspection_date,
    qty: inspectionQty(item),
    approved: adminApprovedQty(item),
    approvedPct: approvedPercentByProduct(item),
    savedPct: savedPercentByProduct(item),
    submittedPct: submittedPercentByProduct(item),
    totalPct: totalProgressPercent(item),
    remaining: remainingItems(item),
    started: adminApprovedQty(item) + savedQty(item) + submittedQty(item) > 0,
    overdue: isOverdue(item),
    waiting: approvals.value.filter(
      approval => approval.product_id === item.id && approval.status === 'submitted'
    ).length,
  }))
)

const filteredAllProducts = computed(() => {
  const search = productSearch.value.toLowerCase().trim()

  if (!search) return allProducts.value

  return allProducts.value.filter(product =>
    product.name?.toLowerCase().includes(search) ||
    product.category?.toLowerCase().includes(search)
  )
})

const selectedProductSavedList = computed(() => {
  if (!selectedProduct.value) return []

  return approvals.value.filter(item => {
    return item.product_id === selectedProduct.value.id && item.status === 'saved'
  })
})

const selectedProductSubmittedList = computed(() => {
  if (!selectedProduct.value) return []

  return approvals.value.filter(item => {
    return item.product_id === selectedProduct.value.id && item.status === 'submitted'
  })
})

// Name of the product that was actually picked from the list.
const pickedProductName = ref('')

function selectProduct(product) {
  newSchedule.value.product_id = product.id
  pickedProductName.value = product.name
  productSearch.value = product.name
  showProductDropdown.value = false
}

// If the admin edits the search text after picking, the old pick no longer counts,
// so a schedule can't be saved for a different product than the one shown.
watch(productSearch, (text) => {
  if (text !== pickedProductName.value) {
    newSchedule.value.product_id = ''
  }
})

function handleClickOutside(e) {
  const dropdown = document.querySelector('.search-select-btn')
  const menu = document.querySelector('.search-select-menu')

  if (
    showProductDropdown.value &&
    dropdown &&
    menu &&
    !dropdown.contains(e.target) &&
    !menu.contains(e.target)
  ) {
    showProductDropdown.value = false
  }
}

// Today's date on THIS computer's clock (YYYY-MM-DD).
// (toISOString() uses UTC, which is a day behind in the Philippines before 8 AM.)
function getToday() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function adminApprovedQty(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
}

// Size of the batch being inspected, fixed when the inspection was scheduled.
// Live stock can't be used: sales and returns change it mid-inspection.
function inspectionQty(product) {
  return Number(product?.inspection_qty ?? product?.quantity ?? 0)
}

function approvalTotal(product, status) {
  return approvals.value
    .filter(item => item.product_id === product.id && item.status === status)
    .reduce((sum, item) => {
      return sum + Number(item.approved_qty || 0) + Number(item.return_qty || 0)
    }, 0)
}

function savedQty(product) {
  return approvalTotal(product, 'saved')
}

function submittedQty(product) {
  return approvalTotal(product, 'submitted')
}

function remainingItems(product) {
  const quantity = inspectionQty(product)

  return Math.max(
    quantity - adminApprovedQty(product) - savedQty(product) - submittedQty(product),
    0
  )
}

function percent(value, quantity) {
  const total = Number(quantity || 0)
  if (total <= 0) return 0

  return Math.min(Math.round((Number(value || 0) / total) * 100), 100)
}

function approvedPercentByProduct(product) {
  return percent(adminApprovedQty(product), inspectionQty(product))
}

function savedPercentByProduct(product) {
  return percent(savedQty(product), inspectionQty(product))
}

function submittedPercentByProduct(product) {
  return percent(submittedQty(product), inspectionQty(product))
}

function totalProgressPercent(product) {
  return Math.min(
    approvedPercentByProduct(product) +
      savedPercentByProduct(product) +
      submittedPercentByProduct(product),
    100
  )
}

function isOverdue(product) {
  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  return product.inspection_date < getToday() && totalDone < quantity
}

function shouldShowInCalendar(product, today) {
  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  const isTodayOrFuture = product.inspection_date >= today
  const isPastButUnfinished = product.inspection_date < today && totalDone < quantity

  return isTodayOrFuture || isPastButUnfinished
}

// ----- Deliveries -----
// late: its date passed and the goods haven't come
function isDeliveryOverdue(delivery) {
  if (!delivery.delivery_date || isDelivered(delivery)) return false
  return String(delivery.delivery_date).slice(0, 10) < getToday()
}

async function fetchApprovals() {
  const { data, error } = await supabase.rpc('list_active_approvals')

  if (!error) {
    approvals.value = data || []
  }
}

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const today = getToday()

  await fetchApprovals()

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'active',
    p_order_by: 'inspection_asc',
  })

  if (error) {
    errorMessage.value = error.message
  } else {
    allProducts.value = data || []

    const visibleProducts = (data || [])
      .filter(product => product.inspection_date)
      .filter(product => shouldShowInCalendar(product, today))

    products.value = visibleProducts

    await createOverdueNotifications(visibleProducts)
  }

  loading.value = false
}

async function fetchDeliveries() {
  const { data, error } = await supabase.rpc('list_deliveries')

  if (!error) {
    // Finished deliveries disappear from the list
    // done ones leave; arrived ones stay until their receipt is through
    deliveries.value = (data || []).filter(isOpenDelivery)
  }
}

// ----- Delete a delivery (asks first, on its card) -----
const deletingId = ref(null)
const deleteBusy = ref(false)
const deleteError = ref('')

function askDelete(delivery) {
  deleteError.value = ''
  deletingId.value = delivery.id
}

async function deleteDelivery(delivery) {
  if (deleteBusy.value) return
  deleteBusy.value = true
  deleteError.value = ''

  const { error } = await supabase.rpc('admin_delete_delivery', { p_delivery_id: delivery.id })

  deleteBusy.value = false
  if (error) {
    deleteError.value = /admin_delete_delivery|schema cache/i.test(error.message)
      ? 'Deleting isn\'t set up yet: run 20261110000001_delete_delivery.sql in Supabase.'
      : error.message
    return
  }

  deletingId.value = null
  deliveries.value = deliveries.value.filter((item) => item.id !== delivery.id)
  toast(`Deleted "${delivery.title}".`)
  refreshTasksSoon()
  fetchDeliveries()
}

// every inspection and delivery as a calendar item
const allEvents = computed(() => [
  ...products.value.map((item) => {
    const overdue = isOverdue(item)
    const pct = totalProgressPercent(item)
    return {
      key: `i${item.id}`,
      kind: 'inspection',
      date: String(item.inspection_date || '').slice(0, 10),
      title: item.name,
      sub: `Batch of ${count(inspectionQty(item))} · ${pct}% done`,
      state: overdue ? 'overdue' : '',
      badge: overdue ? 'Overdue' : pct > 0 ? 'In progress' : 'To do',
      item,
    }
  }),
  ...deliveries.value.map((item) => {
    const overdue = isDeliveryOverdue(item)
    const arrived = item.receipt_state === 'waiting' || item.receipt_state === 'sent'
    return {
      key: `d${item.id}`,
      kind: 'delivery',
      date: String(item.delivery_date || '').slice(0, 10),
      title: item.title,
      sub: item.supplier ? `From ${item.supplier}` : 'No supplier set',
      state: overdue ? 'overdue' : arrived ? 'arrived' : '',
      badge: overdue ? 'Overdue' : arrived ? (receiptStateOf(item)?.text || 'Arrived') : 'Scheduled',
      item,
    }
  }),
])

const kindCounts = computed(() => ({
  inspection: allEvents.value.filter((e) => e.kind === 'inspection').length,
  delivery: allEvents.value.filter((e) => e.kind === 'delivery').length,
}))

const monthEvents = computed(() => allEvents.value.filter((e) => showKinds.value[e.kind]))

const dayItems = computed(() => monthEvents.value.filter((e) => e.date === pickedDay.value))

function openDay(date) {
  deletingId.value = null
  pickedDay.value = date
}

function longDate(date) {
  if (!date) return ''
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// options: { date, type } from a day of the Month view
function openAddModal(options = {}) {
  pickedDay.value = null
  newSchedule.value = {
    type: options.type || activeTab.value,
    product_id: '',
    title: '',
    supplier: '',
    // starts at today (or the day picked)
    date: options.date || getToday(),
  }

  pickedProductName.value = ''
  productSearch.value = ''
  showProductDropdown.value = false
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
  modalError.value = ''
  productSearch.value = ''
  showProductDropdown.value = false
}

// true while saving: a double click used to create the delivery twice
const scheduleSaving = ref(false)

async function saveSchedule() {
  if (scheduleSaving.value) return

  modalError.value = ''

  if (!newSchedule.value.date) {
    modalError.value = 'Please select a date.'
    return
  }

  // typed in by hand: the picker alone doesn't stop it
  if (newSchedule.value.date < getToday()) {
    modalError.value = "Pick today or a later date: that day has already passed."
    return
  }

  scheduleSaving.value = true

  try {
    if (newSchedule.value.type === 'inspection') {
      if (!newSchedule.value.product_id) {
        modalError.value = 'Please select a product.'
        return
      }

      const { error } = await supabase.rpc('schedule_inspection', {
        p_product_id: newSchedule.value.product_id,
        p_date: newSchedule.value.date,
      })

      if (error) {
        modalError.value = error.message
        return
      }
    }

    if (newSchedule.value.type === 'delivery') {
      if (!newSchedule.value.title.trim()) {
        modalError.value = 'Please enter delivery title.'
        return
      }

      const { error } = await supabase.rpc('create_delivery', {
        p_title: newSchedule.value.title.trim(),
        p_supplier: newSchedule.value.supplier.trim() || null,
        p_date: newSchedule.value.date,
      })

      if (error) {
        modalError.value = error.message
        return
      }
    }

    closeAddModal()
    await fetchProducts()
    await fetchDeliveries()
  } finally {
    scheduleSaving.value = false
  }
}

// Remember which overdue products already triggered a notification during this visit,
// so reloading the list after every save doesn't fire the same notification again.
const notifiedOverdue = new Set()

async function createOverdueNotifications(items) {
  for (const item of items) {
    if (!isOverdue(item)) continue
    if (notifiedOverdue.has(item.id)) continue
    notifiedOverdue.add(item.id)

    const quantity = inspectionQty(item)
    const totalDone = adminApprovedQty(item) + savedQty(item) + submittedQty(item)

    await supabase.rpc('create_overdue_notification', {
      p_product_id: item.id,
      p_total_done: totalDone,
      p_quantity: quantity,
    })
  }
}

function formatDate(date) {
  if (!date) return 'No date'

  // "2026-10-13" must be read as a local date, not UTC midnight (can show the day before).
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)

  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const panelClose = ref(null)

async function openPanel(product) {
  selectedProduct.value = product
  panelError.value = ''

  // focus inside the window, so Esc closes it
  await nextTick()
  panelClose.value?.focus()
}

function closePanel() {
  selectedProduct.value = null
  panelError.value = ''
}

onMounted(async () => {
  await fetchProducts()
  await fetchDeliveries()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.label {
  margin-bottom: 0.5rem;
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
  color: rgb(212 212 216);
}

.input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgb(39 39 42);
  padding: 0.85rem 1rem;
  color: white;
  outline: none;
}

.input:focus {
  border-color: rgb(239 68 68);
}

.search-select-btn {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgb(39 39 42);
  padding: 0.85rem 1rem;
  color: white;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.search-select-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 16rem;
  overflow-y: auto;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #18181b;
  padding: 0.6rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.search-box {
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #27272a;
  padding: 0.7rem 1rem;
  position: sticky;
  top: 0;
}

.search-input {
  width: 100%;
  background: transparent;
  color: white;
  outline: none;
}

.search-input::placeholder {
  color: #71717a;
}

.search-item {
  width: 100%;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  text-align: left;
  color: white;
}

.search-item:hover {
  background: #3f3f46;
}

.calendar-date-input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgb(39 39 42);
  padding: 0.85rem 1rem;
  color: white;
  outline: none;
  color-scheme: dark;
}

.calendar-date-input:focus {
  border-color: rgb(239 68 68);
}

.calendar-date-input::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
}

/* Month view: show / hide inspections or deliveries */
.kind-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--hairline);
  background: var(--surface);
  padding: 0.4rem 0.8rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: #fff;
  transition: opacity 0.15s;
}

.kind-toggle.is-off {
  opacity: 0.45;
}

.kind-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
}

.kind-inspection .kind-dot {
  background: #a78bfa;
}

.kind-delivery .kind-dot {
  background: #38bdf8;
}
</style>