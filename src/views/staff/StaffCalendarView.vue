<template>
  <div>
    <PageHeader
      title="Staff Calendar"
      subtitle="Inspect products and manage inspection submissions."
    />

    <!-- tabs like the Approval page's -->
    <div class="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/5 bg-zinc-900 p-1">
      <button
        type="button"
        class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition"
        :class="activeTab === 'inspection' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'"
        :aria-pressed="activeTab === 'inspection'"
        @click="activeTab = 'inspection'"
      >
        Inspection
        <span
          v-if="taskBadges.tabs['staff:inspection']"
          class="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-extrabold"
          :class="activeTab === 'inspection' ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
          :title="'Inspections to do today or overdue'"
        >{{ taskBadges.tabs['staff:inspection'] }}</span>
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
          v-if="taskBadges.tabs['staff:delivery']"
          class="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-extrabold"
          :class="activeTab === 'delivery' ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
          :title="'Deliveries due, and supplier deliveries to receive'"
        >{{ taskBadges.tabs['staff:delivery'] }}</span>
      </button>
    </div>

    <p v-if="loading && activeTab === 'delivery'" class="text-sm text-zinc-400">Loading...</p>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
      {{ errorMessage }}
    </p>

    <!-- INSPECTION: one table row per product; Inspect opens the form below -->
    <InspectionTable
      v-if="activeTab === 'inspection'"
      :rows="inspectionRows"
      :loading="loading"
      action-label="Inspect"
      storage-key="staffInspections"
      @open="openPanel"
    />

    <!-- DELIVERY -->
    <div v-if="activeTab === 'delivery'">
      <!-- SUPPLIER DELIVERIES the owner chose you to receive: count what
           arrives, then "Mark as delivered": it goes into stock right away
           (lib/receiving.js) -->
      <p v-if="receiveMessage" class="mb-4 rounded-xl bg-emerald-600/15 p-4 text-sm text-emerald-300" role="status">
        {{ receiveMessage }}
      </p>

      <section v-if="waitingReceivings.length > 0" class="mb-6" aria-label="Supplier deliveries to receive">
        <h2 class="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-violet-300">To receive from suppliers</h2>

        <div class="delivery-grid">
          <article
            v-for="delivery in waitingReceivings"
            :key="'rcv-' + delivery.id"
            class="flex flex-col justify-between gap-4 rounded-[22px] border bg-zinc-900 p-5 shadow-xl"
            :class="isReceivingLate(delivery) ? 'border-white/10' : 'border-violet-500/30'"
          >
            <div class="min-w-0">
              <p class="truncate text-lg font-bold text-white" :title="delivery.file_name">{{ delivery.file_name || 'Delivery' }}</p>
              <p v-if="delivery.supplier_name" class="text-sm text-zinc-400">From {{ delivery.supplier_name }}</p>
              <p class="mt-2 text-sm text-zinc-300">
                {{ count(delivery.items.length) }} {{ delivery.items.length === 1 ? 'product' : 'products' }} ·
                {{ count(piecesOf(delivery)) }} pcs
              </p>
              <p v-if="delivery.expected_date" class="mt-1 text-sm font-bold" :class="isReceivingLate(delivery) ? 'text-red-400' : 'text-violet-300'">
                {{ isReceivingLate(delivery) ? 'Late · expected' : 'Expected' }} {{ dayText(delivery.expected_date) }}
              </p>
              <p v-if="delivery.note" class="mt-2 rounded-lg bg-white/5 p-2 text-xs text-zinc-300">
                <b>Owner:</b> {{ delivery.note }}
              </p>
            </div>

            <button
              type="button"
              class="w-full rounded-xl bg-violet-500 py-2.5 text-sm font-bold text-white hover:bg-violet-400"
              @click="openReceive(delivery)"
            >
              Receive
            </button>
          </article>
        </div>
      </section>

      <!-- SCHEDULED by the owner: mark them when the goods come -->
      <section ref="deliveriesTop" class="mb-8 scroll-mt-4" aria-label="Scheduled deliveries">
        <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 class="text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-300">Scheduled deliveries</h2>
          <span v-if="deliveries.length" class="text-xs text-zinc-500">
            {{ deliveries.length }} {{ deliveries.length === 1 ? 'delivery' : 'deliveries' }} · soonest first
          </span>
          <!-- only worth it once the list is long -->
          <input
            maxlength="80"
            v-if="deliveries.length > 4"
            v-model="deliverySearch"
            type="search"
            placeholder="Search title or supplier..."
            aria-label="Search deliveries"
            class="w-full rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500 sm:ml-auto sm:w-64"
          />
        </div>

        <p
          v-if="deliveries.length > 0 && shownDeliveries.length === 0"
          class="rounded-[22px] border border-white/10 bg-zinc-900/50 p-5 text-center text-sm text-zinc-400"
        >
          No delivery matches "{{ deliverySearch }}".
        </p>

        <div
          v-if="deliveries.length === 0"
          class="rounded-[22px] border border-dashed border-white/15 bg-zinc-900/50 p-6 text-center"
        >
          <p class="font-bold text-zinc-300">No deliveries scheduled</p>
          <p class="mt-1 text-sm text-zinc-500">When the owner schedules one, it shows up here.</p>
        </div>

        <div v-else-if="shownDeliveries.length > 0" class="delivery-grid">
          <article
            v-for="delivery in visibleDeliveries"
            :key="delivery.id"
            class="flex flex-col gap-4 rounded-[22px] border border-white/10 bg-zinc-900 p-5 shadow-xl"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <h3 class="min-w-0 truncate text-lg font-bold text-white" :title="delivery.title">{{ delivery.title }}</h3>
                <span
                  class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                  :class="dueChip(delivery).tone"
                >
                  {{ dueChip(delivery).text }}
                </span>
              </div>
              <p class="mt-1 truncate text-sm text-zinc-400">
                From <span class="text-zinc-200">{{ delivery.supplier || 'no supplier set' }}</span>
              </p>

              <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt class="text-zinc-500">Date</dt>
                <dd class="font-semibold text-zinc-200">{{ formatDate(delivery.delivery_date) }}</dd>
                <dt class="text-zinc-500">Status</dt>
                <dd>
                  <span
                    v-if="receiptStateOf(delivery)"
                    class="rounded-full px-2.5 py-0.5 text-xs font-bold"
                    :class="receiptStateOf(delivery).tone"
                  >
                    {{ receiptStateOf(delivery).text }}
                  </span>
                  <span v-else class="font-semibold text-emerald-400">{{ delivery.status || 'Scheduled' }}</span>
                </dd>
              </dl>

              <p v-if="delivery.receipt_state === 'sent'" class="mt-3 text-xs text-zinc-500">
                The owner is checking its receipt; its stock is added after that.
              </p>
            </div>

            <!-- arrived, no receipt yet: upload it when it comes -->
            <button
              v-if="delivery.receipt_state === 'waiting'"
              type="button"
              class="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400"
              @click="openArrival(delivery, 'upload')"
            >
              Upload its receipt
            </button>
            <button
              v-else-if="!isDelivered(delivery)"
              type="button"
              class="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
              @click="openArrival(delivery, 'ask')"
            >
              ✓ Mark as delivered
            </button>
          </article>
        </div>

        <!-- 8 or 16 cards a page (2 or 4 full rows), or all of them -->
        <TablePager
          v-if="shownDeliveries.length > 8"
          v-model:page="deliveryPage"
          v-model:page-size="deliveryPageSize"
          :total="shownDeliveries.length"
          :sizes="[8, 16, 0]"
          label="Per page"
          noun="deliveries"
          card
          class="mt-4"
        />
      </section>

      <!-- received: a short record for the staff member (the list keeps
           them 3 days), folded away so it never pushes the work down -->
      <section v-if="receivedReceivings.length > 0" ref="receivedTop" class="scroll-mt-4" aria-label="Recently received">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-[18px] border border-white/10 bg-zinc-900/60 px-5 py-3.5 text-left transition hover:border-white/20 hover:bg-zinc-900"
          :aria-expanded="showReceived"
          @click="showReceived = !showReceived"
        >
          <span class="text-sm font-extrabold uppercase tracking-[0.14em] text-zinc-300">Recently received</span>
          <span class="rounded-full bg-emerald-600/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
            {{ receivedReceivings.length }}
          </span>
          <span class="hidden text-xs text-zinc-500 sm:inline">Already in stock · shown for 3 days</span>
          <span class="ml-auto text-sm font-bold text-zinc-400">{{ showReceived ? 'Hide ▴' : 'Show ▾' }}</span>
        </button>

        <div v-if="showReceived" class="card mt-3 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="data-table resp-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Received</th>
                  <th>By</th>
                  <th>Added to stock</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="delivery in visibleReceived" :key="'rcvd-' + delivery.id">
                  <td class="cell-main">
                    <p class="max-w-xs truncate font-bold text-white" :title="delivery.supplier_name || delivery.file_name">
                      {{ delivery.supplier_name || delivery.file_name || 'Delivery' }}
                    </p>
                    <p v-if="delivery.supplier_name && delivery.file_name" class="max-w-xs truncate text-xs text-zinc-500" :title="delivery.file_name">
                      {{ delivery.file_name }}
                    </p>
                  </td>
                  <td data-label="Received" class="whitespace-nowrap text-sm text-zinc-300">{{ dayAndTime(delivery.received_at) }}</td>
                  <td data-label="By" class="text-sm text-zinc-300">{{ delivery.received_by_name || 'You' }}</td>
                  <td data-label="Added to stock" class="text-sm">
                    <span class="font-bold text-emerald-300">
                      ✓ {{ count(addedPieces(delivery)) }} of {{ count(piecesOf(delivery)) }} pcs
                    </span>
                    <span v-if="shortItems(delivery).length" class="block text-xs font-bold text-amber-300">
                      {{ count(shortItems(delivery).length) }} {{ shortItems(delivery).length === 1 ? 'product' : 'products' }} came short
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <TablePager
            v-if="receivedReceivings.length > 5"
            v-model:page="receivedPage"
            v-model:page-size="receivedPageSize"
            :total="receivedReceivings.length"
            :sizes="[5, 10, 0]"
            noun="deliveries"
          />
        </div>
      </section>
    </div>

    <!-- RECEIVE A SUPPLIER DELIVERY -->
    <ReceiveDeliveryModal
      v-if="receiveTarget"
      :delivery="receiveTarget"
      :busy="receiveBusy"
      :error="receiveError"
      @confirm="confirmReceive"
      @close="receiveTarget = null"
    />

    <!-- THE GOODS ARRIVED: the receipt is what puts them in stock, so ask
         for it (lib/deliveries.js). Upload it now, or say it's coming. -->
    <div
      v-if="arrival"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4"
    >
      <div
        class="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arrival-title"
      >
        <p class="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-400">
          {{ arrival.step === 'upload' && arrival.delivery.receipt_state === 'waiting' ? 'Its receipt came' : 'Mark as delivered' }}
        </p>
        <h2 id="arrival-title" class="mt-1 text-xl font-bold text-white">{{ arrival.delivery.title }}</h2>
        <p class="text-sm text-zinc-400">
          {{ arrival.delivery.supplier || 'No supplier' }} · {{ formatDate(arrival.delivery.delivery_date) }}
        </p>

        <!-- 1. the question -->
        <template v-if="arrival.step === 'ask'">
          <p class="mt-5 font-bold text-white">Did the receipt come with the goods?</p>
          <p class="mt-1 text-sm text-zinc-400">The stock is added from the receipt, after the owner checks it.</p>

          <p v-if="arrivalError" class="mt-3 rounded-lg bg-red-600/20 p-2 text-sm text-red-400" role="alert">{{ arrivalError }}</p>

          <div class="mt-4 flex flex-col gap-2">
            <button
              type="button"
              class="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              :disabled="arrivalSaving"
              @click="arrival.step = 'upload'"
            >
              Yes, upload it now
            </button>
            <button
              type="button"
              class="w-full rounded-xl border border-amber-500/40 py-3 font-bold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
              :disabled="arrivalSaving"
              @click="arrivedWithoutReceipt"
            >
              {{ arrivalSaving ? 'Saving…' : 'No, the supplier will send it' }}
            </button>
            <button
              type="button"
              class="w-full rounded-xl bg-zinc-800 py-2.5 text-sm font-bold text-white hover:bg-zinc-700"
              :disabled="arrivalSaving"
              @click="arrival = null"
            >
              Cancel
            </button>
          </div>
        </template>

        <!-- 2. the receipt, linked to this delivery -->
        <template v-else>
          <ReceiptUploadForm
            class="mt-5"
            mode="staff"
            :delivery-id="arrival.delivery.id"
            :delivery-title="arrival.delivery.title"
            :preset-supplier="arrival.delivery.supplier || ''"
            @done="receiptUploaded"
          />
          <button
            type="button"
            class="mt-2 w-full rounded-xl bg-zinc-800 py-2.5 text-sm font-bold text-white hover:bg-zinc-700"
            @click="arrival = null"
          >
            Cancel
          </button>
        </template>
      </div>
    </div>

    <!-- INSPECTION WINDOW: count the batch, save, then submit to the admin -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePanel"
      @keydown.esc="closePanel"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-title"
      >
        <!-- HEADER -->
        <div class="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div class="min-w-0">
            <h2 id="inspect-title" class="text-xl font-bold text-white">{{ selectedProduct.name }}</h2>
            <p class="text-sm text-zinc-400">
              <span class="text-red-400">{{ selectedProduct.category || 'Uncategorized' }}</span>
              · {{ formatDate(selectedProduct.inspection_date) }}
              · batch of {{ count(inspectionQty(selectedProduct)) }}
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

        <div class="space-y-5 overflow-y-auto px-5 py-5">
          <!-- PROGRESS: the numbers under the bar are its legend -->
          <div>
            <div class="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span class="font-bold text-white">{{ liveTotalProgressPercent }}% inspected</span>
              <span class="text-zinc-400">
                <b class="text-white">{{ count(remainingInspectable(selectedProduct)) }}</b> left
              </span>
            </div>

            <div class="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div class="h-full bg-red-600 transition-all duration-300" :style="{ width: approvedSegmentPercent + '%' }"></div>
              <div class="h-full bg-lime-400 transition-all duration-300" :style="{ width: savedSegmentPercent + '%' }"></div>
              <div class="h-full bg-yellow-400 transition-all duration-300" :style="{ width: submittedSegmentPercent + '%' }"></div>
            </div>

            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full bg-red-600" aria-hidden="true"></span>
                Approved by owner <b class="text-white">{{ count(adminApprovedQty(selectedProduct)) }}</b>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full bg-lime-400" aria-hidden="true"></span>
                Saved <b class="text-white">{{ count(savedQty(selectedProduct)) }}</b>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full bg-yellow-400" aria-hidden="true"></span>
                Submitted <b class="text-white">{{ count(submittedQty(selectedProduct)) }}</b>
              </span>
            </div>
          </div>

          <!-- THE FORM -->
          <div class="rounded-xl border border-white/10 bg-black/40 p-4">
            <p class="mb-3 text-sm font-bold text-white">
              {{ editingApprovalId ? 'Your saved inspection' : 'Your inspection' }}
            </p>

            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="mb-1 block text-xs font-semibold text-zinc-300">Approved (good)</span>
                <input
                  v-model.number="approvedQty"
                  type="number"
                  min="0"
                  :max="maxApprovedInput"
                  inputmode="numeric"
                  class="inspection-input"
                  @input="limitApproved"
                />
                <span class="mt-1 block text-[11px] text-zinc-500">up to {{ count(maxApprovedInput) }}</span>
              </label>

              <label class="block">
                <span class="mb-1 block text-xs font-semibold text-zinc-300">Return</span>
                <input
                  v-model.number="returnQty"
                  type="number"
                  min="0"
                  :max="maxReturnInput"
                  inputmode="numeric"
                  class="inspection-input"
                  @input="limitReturn"
                />
                <span class="mt-1 block text-[11px] text-zinc-500">up to {{ count(maxReturnInput) }}</span>
              </label>
            </div>

            <p class="mt-3 text-xs text-zinc-400">
              Counting <b class="text-white">{{ count(liveInputQty) }}</b> of the
              {{ count(availableForEditing) }} not inspected yet.
            </p>
          </div>

          <!-- MESSAGES -->
          <p v-if="panelMessage" class="rounded-lg bg-emerald-600/20 p-3 text-sm text-emerald-400" role="status">
            {{ panelMessage }}
          </p>
          <p v-if="panelError" class="rounded-lg bg-red-600/20 p-3 text-sm text-red-400" role="alert">
            {{ panelError }}
          </p>

          <!-- THIS BATCH'S INSPECTIONS (only when there are some) -->
          <div v-if="selectedProductSavedList.length || selectedProductSubmittedList.length">
            <p class="mb-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-zinc-500">
              Inspections of this batch
            </p>

            <ul class="space-y-2">
              <li
                v-for="approval in selectedProductSavedList"
                :key="approval.id"
                class="rounded-xl border border-lime-500/20 bg-black/40 px-3 py-2.5"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0 text-sm">
                    <p class="truncate font-semibold text-white">
                      {{ isMyApproval(approval) ? 'You' : approval.requested_by || 'Staff' }}
                    </p>
                    <p class="text-xs text-zinc-400">
                      Approved {{ count(approval.approved_qty) }} · Return {{ count(approval.return_qty) }}
                    </p>
                  </div>
                  <span class="shrink-0 rounded-full bg-lime-500/15 px-2 py-0.5 text-[11px] font-bold text-lime-400">
                    Saved, not submitted
                  </span>
                </div>

                <div v-if="isMyApproval(approval)" class="mt-2 flex gap-2">
                  <button
                    class="flex-1 rounded-lg bg-yellow-500 py-1.5 text-xs font-bold text-black hover:bg-yellow-400 disabled:opacity-50"
                    :disabled="panelBusy"
                    @click="submitSavedApproval(approval)"
                  >
                    Submit to owner
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-zinc-800 py-1.5 text-xs font-bold text-red-300 hover:bg-zinc-700 disabled:opacity-50"
                    :disabled="panelBusy"
                    @click="removeSavedInspection(approval)"
                  >
                    Remove
                  </button>
                </div>
              </li>

              <li
                v-for="approval in selectedProductSubmittedList"
                :key="approval.id"
                class="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/20 bg-black/40 px-3 py-2.5"
              >
                <div class="min-w-0 text-sm">
                  <p class="truncate font-semibold text-white">
                    {{ isMyApproval(approval) ? 'You' : approval.requested_by || 'Staff' }}
                  </p>
                  <p class="text-xs text-zinc-400">
                    Approved {{ count(approval.approved_qty) }} · Return {{ count(approval.return_qty) }}
                  </p>
                </div>
                <span class="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-bold text-yellow-400">
                  Waiting for owner
                </span>
              </li>
            </ul>
          </div>
        </div>

        <!-- FOOTER -->
        <div class="flex gap-2 border-t border-white/10 px-5 py-4">
          <button
            class="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
            :disabled="panelBusy"
            @click="closePanel"
          >
            Close
          </button>
          <button
            class="flex-[2] rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="panelBusy"
            @click="saveInspection"
          >
            {{ panelBusy ? 'Saving...' : editingApprovalId ? 'Update Saved Inspection' : 'Save Inspection' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { readCurrentUser } from '../../lib/currentUser'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { refreshTasksSoon, taskBadges } from '../../lib/taskCounts'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import InspectionTable from '../../components/InspectionTable.vue'
import { count, dayAndTime } from '../../lib/format'
import { useQueryParam } from '../../lib/useQueryParam'
import { isDelivered, isOpenDelivery, markArrivedWithoutReceipt, receiptStateOf } from '../../lib/deliveries'
import ReceiptUploadForm from '../../components/ReceiptUploadForm.vue'
import { toast } from '../../lib/toast'
import ReceiveDeliveryModal from '../../components/ReceiveDeliveryModal.vue'
import TablePager from '../../components/TablePager.vue'
import { usePagination } from '../../lib/usePagination'
import { addedPieces, dayText, listMyReceivings, piecesOf, receiveDelivery, shortItems, todayKey } from '../../lib/receiving'

// Inspection / Delivery, kept in the address (?tab=delivery) so the
// Dashboard's delivery links open that tab and a refresh keeps it
const activeTab = useQueryParam('tab', 'inspection', ['inspection', 'delivery'])

const inspections = ref([])
const approvals = ref([])
const deliveries = ref([])

const loading = ref(false)
const errorMessage = ref('')
const panelError = ref('')
const panelMessage = ref('')

const selectedProduct = ref(null)
const approvedQty = ref(0)
const returnQty = ref(0)
const editingApprovalId = ref(null)

const currentUser = readCurrentUser()
const currentStaffName = currentUser.full_name || currentUser.email || 'Staff'

// One row of the inspection table per product to inspect (see InspectionTable)
const inspectionRows = computed(() =>
  inspections.value.map(item => ({
    item,
    date: item.inspection_date,
    qty: inspectionQty(item),
    approved: adminApprovedQty(item),
    approvedPct: approvedPercentByProduct(item),
    savedPct: savedPercentByProduct(item),
    submittedPct: submittedPercentByProduct(item),
    totalPct: totalProgressPercent(item),
    remaining: remainingInspectable(item),
    started: adminApprovedQty(item) + savedQty(item) + submittedQty(item) > 0,
    overdue: isOverdue(item),
    waiting: productApprovals(item, 'submitted').length,
    mine: productApprovals(item, 'saved').some(isMyApproval),
  }))
)

const selectedProductSavedList = computed(() => {
  if (!selectedProduct.value) return []
  return approvals.value.filter(item =>
    item.product_id === selectedProduct.value.id && item.status === 'saved'
  )
})

const selectedProductSubmittedList = computed(() => {
  if (!selectedProduct.value) return []
  return approvals.value.filter(item =>
    item.product_id === selectedProduct.value.id && item.status === 'submitted'
  )
})

const currentEditingApproval = computed(() => {
  if (!editingApprovalId.value) return null
  return approvals.value.find(item => item.id === editingApprovalId.value) || null
})

const oldEditingQty = computed(() => {
  if (!currentEditingApproval.value) return 0
  return (
    Number(currentEditingApproval.value.approved_qty || 0) +
    Number(currentEditingApproval.value.return_qty || 0)
  )
})

const liveInputQty = computed(() => {
  return Number(approvedQty.value || 0) + Number(returnQty.value || 0)
})

const availableForEditing = computed(() => {
  if (!selectedProduct.value) return 0
  const baseRemaining = remainingInspectable(selectedProduct.value)
  if (!currentEditingApproval.value) return baseRemaining
  return baseRemaining + oldEditingQty.value
})

const maxApprovedInput = computed(() => {
  return Math.max(availableForEditing.value - Number(returnQty.value || 0), 0)
})

const maxReturnInput = computed(() => {
  return Math.max(availableForEditing.value - Number(approvedQty.value || 0), 0)
})

const approvedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0
  return percent(adminApprovedQty(selectedProduct.value), inspectionQty(selectedProduct.value))
})

const savedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0
  const liveSaved = savedQty(selectedProduct.value) - oldEditingQty.value + liveInputQty.value
  return percent(liveSaved, inspectionQty(selectedProduct.value))
})

const submittedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0
  return percent(submittedQty(selectedProduct.value), inspectionQty(selectedProduct.value))
})

const liveTotalProgressPercent = computed(() => {
  return Math.min(
    approvedSegmentPercent.value + savedSegmentPercent.value + submittedSegmentPercent.value,
    100
  )
})

// Logged-in user's id: inspections are "mine" by id, so renaming yourself
// or sharing a name with someone else no longer mixes them up.
const myUserId = ref(null)

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  myUserId.value = session?.user?.id || null
  await fetchAll()
})

async function fetchAll() {
  // approvals first: the visibility filter needs saved/submitted totals
  await fetchApprovals()
  await fetchInspections()
  await fetchDeliveries()
}

async function fetchInspections() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'inspection',
    p_order_by: 'inspection_asc',
  })

  if (error) {
    errorMessage.value = error.message
    inspections.value = []
  } else {
    // Same rule as the Admin calendar: hide products whose inspection date has
    // passed AND are already fully inspected. Approvals must be loaded first.
    const today = getToday()
    inspections.value = (data || []).filter(product => shouldShowInCalendar(product, today))
  }

  loading.value = false
}

async function fetchApprovals() {
  const { data, error } = await supabase.rpc('list_active_approvals')

  if (!error) {
    approvals.value = data || []
  }
}

// Today's date on this computer's clock (YYYY-MM-DD).
function getToday() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function shouldShowInCalendar(product, today) {
  if (!product.inspection_date) return false

  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  const isTodayOrFuture = product.inspection_date >= today
  const isPastButUnfinished = product.inspection_date < today && totalDone < quantity

  return isTodayOrFuture || isPastButUnfinished
}

// Same rule as the Admin calendar: inspection date has passed
// and not every item has been approved, saved or submitted yet.
function isOverdue(product) {
  if (!product.inspection_date) return false

  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  return product.inspection_date < getToday() && totalDone < quantity
}

async function fetchDeliveries() {
  fetchReceivings()
  const { data, error } = await supabase.rpc('list_deliveries')

  if (!error) {
    // done ones leave; arrived ones stay until their receipt is through
    deliveries.value = (data || []).filter(isOpenDelivery)
  }
}

// ----- Supplier deliveries the owner chose you to receive -----
const receivings = ref([])
// waiting first (to do), then the ones received in the last 3 days (done)
const waitingReceivings = computed(() => receivings.value.filter((delivery) => delivery.status === 'waiting'))
const receivedReceivings = computed(() => receivings.value.filter((delivery) => delivery.status === 'received'))

// work done here (saved, submitted, received): the menu's numbers follow
watch([inspections, approvals, deliveries, receivings], () => refreshTasksSoon())
const receiveTarget = ref(null)
const receiveBusy = ref(false)
const receiveError = ref('')
const receiveMessage = ref('')

async function fetchReceivings() {
  try {
    receivings.value = await listMyReceivings()
  } catch (err) {
    console.error(err)
  }
}

function isReceivingLate(delivery) {
  return delivery.status === 'waiting' && Boolean(delivery.expected_date) && delivery.expected_date < todayKey()
}

function openReceive(delivery) {
  receiveError.value = ''
  receiveMessage.value = ''
  receiveTarget.value = delivery
}

async function confirmReceive({ items, note }) {
  const delivery = receiveTarget.value
  if (!delivery || receiveBusy.value) return
  receiveBusy.value = true
  receiveError.value = ''

  try {
    await receiveDelivery(delivery.id, items, note)
    receiveTarget.value = null
    const pieces = items.reduce((sum, item) => sum + item.received_qty, 0)
    receiveMessage.value = `"${delivery.file_name || 'The delivery'}" is delivered: ${count(pieces)} pcs added to stock. The owner got the details.`
    await fetchReceivings()
  } catch (err) {
    receiveError.value = err.message
  } finally {
    receiveBusy.value = false
  }
}

// ----- The goods arrived: the receipt with them, or coming later -----
const arrival = ref(null) // { delivery, step: 'ask' | 'upload' }
const arrivalError = ref('')
const arrivalSaving = ref(false)

function openArrival(delivery, step) {
  arrivalError.value = ''
  arrival.value = { delivery, step }
}

async function arrivedWithoutReceipt() {
  const delivery = arrival.value?.delivery
  if (!delivery || arrivalSaving.value) return
  arrivalSaving.value = true
  arrivalError.value = ''
  try {
    await markArrivedWithoutReceipt(delivery.id)
    arrival.value = null
    toast(`"${delivery.title}" arrived. The owner was told its receipt is still to come.`)
    await fetchDeliveries()
  } catch (err) {
    arrivalError.value = err.message
  } finally {
    arrivalSaving.value = false
  }
}

// uploaded (the form says so): the delivery now waits on the owner
async function receiptUploaded() {
  arrival.value = null
  await fetchDeliveries()
}

function productApprovals(product, status) {
  return approvals.value.filter(item =>
    item.product_id === product.id && item.status === status
  )
}

function approvalTotal(list) {
  return list.reduce((sum, item) => {
    return sum + Number(item.approved_qty || 0) + Number(item.return_qty || 0)
  }, 0)
}

function savedQty(product) {
  return approvalTotal(productApprovals(product, 'saved'))
}

function submittedQty(product) {
  return approvalTotal(productApprovals(product, 'submitted'))
}

function adminApprovedQty(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
}

// Size of the batch being inspected, fixed when the inspection was scheduled.
// Live stock can't be used: sales and returns change it mid-inspection.
function inspectionQty(product) {
  return Number(product?.inspection_qty ?? product?.quantity ?? 0)
}

function remainingInspectable(product) {
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

// Saved before ids were recorded (requested_by_id empty)? Then by name, as before.
function isMyApproval(approval) {
  if (approval.requested_by_id) return approval.requested_by_id === myUserId.value
  return approval.requested_by === currentStaffName
}

const panelClose = ref(null)

function openPanel(product) {
  selectedProduct.value = product
  panelError.value = ''
  panelMessage.value = ''

  // focus inside the window, so Esc closes it
  nextTick(() => panelClose.value?.focus())

  const mine = approvals.value.find(item =>
    item.product_id === product.id &&
    item.status === 'saved' &&
    isMyApproval(item)
  )

  if (mine) {
    editingApprovalId.value = mine.id
    approvedQty.value = Number(mine.approved_qty || 0)
    returnQty.value = Number(mine.return_qty || 0)
  } else {
    editingApprovalId.value = null
    approvedQty.value = 0
    returnQty.value = 0
  }
}

// Not while Save / Submit / Remove is running: its result ("Inspection
// saved", the refreshed numbers) would land in the next window opened.
function closePanel() {
  if (panelBusy.value) return

  selectedProduct.value = null
  approvedQty.value = 0
  returnQty.value = 0
  editingApprovalId.value = null
  panelError.value = ''
  panelMessage.value = ''
}

function limitApproved() {
  let approved = Number(approvedQty.value || 0)
  let returned = Number(returnQty.value || 0)
  if (approved < 0) approved = 0
  if (returned < 0) returned = 0
  if (approved + returned > availableForEditing.value) {
    approved = availableForEditing.value - returned
  }
  approvedQty.value = Math.max(approved, 0)
  returnQty.value = Math.max(returned, 0)
}

function limitReturn() {
  let approved = Number(approvedQty.value || 0)
  let returned = Number(returnQty.value || 0)
  if (approved < 0) approved = 0
  if (returned < 0) returned = 0
  if (approved + returned > availableForEditing.value) {
    returned = availableForEditing.value - approved
  }
  approvedQty.value = Math.max(approved, 0)
  returnQty.value = Math.max(returned, 0)
}

// true while Save / Submit / Remove is running: the buttons are greyed out
// (a double click on Save used to create two drafts for the same items)
const panelBusy = ref(false)

async function saveInspection() {
  if (panelBusy.value) return

  panelError.value = ''
  panelMessage.value = ''

  if (!selectedProduct.value) return

  limitApproved()
  limitReturn()

  const approved = Number(approvedQty.value || 0)
  const returned = Number(returnQty.value || 0)
  const total = approved + returned

  if (total <= 0) {
    panelError.value = 'Enter approved or return quantity first.'
    return
  }

  if (total > availableForEditing.value) {
    panelError.value = `You can only inspect ${availableForEditing.value} remaining item(s).`
    return
  }

  const isEditing = Boolean(editingApprovalId.value)

  panelBusy.value = true
  try {
    await saveDraft(approved, returned, isEditing)
  } finally {
    panelBusy.value = false
  }
}

async function saveDraft(approved, returned, isEditing) {
  const { error } = await supabase.rpc('save_inspection_draft', {
    p_approval_id: editingApprovalId.value || null,
    p_product_id: selectedProduct.value.id,
    p_product_name: selectedProduct.value.name,
    p_approved_qty: approved,
    p_return_qty: returned,
    p_requested_by: currentStaffName,
  })

  if (error) {
    panelError.value = error.message
    return
  }

  panelMessage.value = isEditing
    ? 'Your saved inspection was updated.'
    : 'Inspection saved. It is not submitted yet.'

  await fetchAll()

  // the window may have been closed while saving
  if (!selectedProduct.value) return

  const latestMine = approvals.value.find(item =>
    item.product_id === selectedProduct.value.id &&
    item.status === 'saved' &&
    isMyApproval(item)
  )

  if (latestMine) {
    editingApprovalId.value = latestMine.id
    approvedQty.value = Number(latestMine.approved_qty || 0)
    returnQty.value = Number(latestMine.return_qty || 0)
  }
}

async function submitSavedApproval(approval) {
  if (panelBusy.value) return

  if (!isMyApproval(approval)) {
    panelError.value = 'You can only submit your own inspection.'
    return
  }

  panelBusy.value = true
  try {
    const { error } = await supabase.rpc('submit_inspection_approval', {
      p_approval_id: approval.id,
    })

    if (error) {
      panelError.value = error.message
      return
    }

    panelMessage.value = "Submitted for the owner's approval."
    approvedQty.value = 0
    returnQty.value = 0
    editingApprovalId.value = null

    await fetchAll()
  } finally {
    panelBusy.value = false
  }
}

async function removeSavedInspection(approval) {
  if (panelBusy.value) return

  if (!isMyApproval(approval)) {
    panelError.value = 'You can only remove your own inspection.'
    return
  }

  const confirmDelete = confirm('Remove this saved inspection?')
  if (!confirmDelete) return

  panelBusy.value = true
  try {
    const { error } = await supabase.rpc('delete_inspection_draft', {
      p_approval_id: approval.id,
    })

    if (error) {
      panelError.value = error.message
      return
    }

    panelMessage.value = 'Saved inspection removed.'
    approvedQty.value = 0
    returnQty.value = 0
    editingApprovalId.value = null

    await fetchAll()
  } finally {
    panelBusy.value = false
  }
}

// ----- Many deliveries: search, soonest first, a page at a time -----
const deliverySearch = ref('')
const shownDeliveries = computed(() => {
  const words = deliverySearch.value.trim().toLowerCase()
  // arrived ones (need their receipt) first, then by date, late at the top
  const rank = (d) => (d.receipt_state === 'waiting' ? 0 : d.receipt_state === 'sent' ? 2 : 1)
  return deliveries.value
    .filter((d) => !words || `${d.title || ''} ${d.supplier || ''}`.toLowerCase().includes(words))
    .slice()
    .sort((a, b) => rank(a) - rank(b) || String(a.delivery_date || '9').localeCompare(String(b.delivery_date || '9')))
})
const deliveriesTop = ref(null)
const {
  page: deliveryPage,
  pageSize: deliveryPageSize,
  visible: visibleDeliveries,
  reset: resetDeliveryPage,
} = usePagination(shownDeliveries, { storageKey: 'staffDeliveries', scrollTarget: deliveriesTop, sizes: [8, 16, 0] })
watch(deliverySearch, resetDeliveryPage)

// received: folded away until opened, then a short table
const showReceived = ref(false)
const receivedTop = ref(null)
const {
  page: receivedPage,
  pageSize: receivedPageSize,
  visible: visibleReceived,
} = usePagination(receivedReceivings, { storageKey: 'staffReceived', scrollTarget: receivedTop, sizes: [5, 10, 0] })

// the corner chip: how near the delivery is ("Tomorrow", "2 days late")
function dueChip(delivery) {
  if (delivery.receipt_state === 'waiting' || delivery.receipt_state === 'sent') {
    return { text: 'Arrived', tone: 'bg-sky-500/15 text-sky-300' }
  }
  if (!delivery.delivery_date) return { text: 'No date', tone: 'bg-white/5 text-zinc-400' }
  const [y, m, d] = String(delivery.delivery_date).slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = getToday().split('-').map(Number)
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
  if (days < 0) {
    return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, tone: 'bg-red-600/20 text-red-300' }
  }
  if (days === 0) return { text: 'Today', tone: 'bg-amber-500/20 text-amber-300' }
  if (days === 1) return { text: 'Tomorrow', tone: 'bg-violet-500/20 text-violet-200' }
  return { text: `In ${days} days`, tone: 'bg-white/5 text-zinc-300' }
}

function formatDate(date) {
  if (!date) return 'No date'
  // Read "2026-10-13" as a local date, not UTC midnight (can show the day before).
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<style scoped>
/* every delivery card the same width, on every row and section */
.delivery-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
}

.inspection-input {
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid rgb(63 63 70);
  background: rgb(39 39 42);
  padding: 0.5rem 0.75rem;
  text-align: center;
  font-size: 0.875rem;
  color: white;
  outline: none;
}

.inspection-input:focus {
  border-color: rgb(239 68 68);
}
</style>