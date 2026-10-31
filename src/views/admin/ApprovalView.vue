<template>
  <div>
    <PageHeader
      title="Approval"
      subtitle="Review supplier receipts and staff inspection requests."
    />

    <!-- TABS: one list at a time; the number is what's waiting in each.
         The open tab is in the address (?tab=inspections), so a refresh
         keeps it and a notification opens the right one. -->
    <div class="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:mb-6 sm:gap-3">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-bold transition sm:px-5 sm:py-3 sm:text-base"
        :class="activeTab === tab.key
          ? 'bg-red-600 text-white'
          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'"
        :aria-pressed="activeTab === tab.key"
        :title="tab.hint"
        @click="openTab(tab.key)"
      >
        <!-- phones: the short name, so both tabs fit side by side -->
        <span class="sm:hidden">{{ tab.short }}</span>
        <span class="hidden sm:inline">{{ tab.label }}</span>
        <span
          v-if="tab.count > 0"
          class="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-extrabold"
          :class="activeTab === tab.key ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
        >
          {{ count(tab.count) }}
        </span>
      </button>
    </div>

    <!-- ============================================================
         SUPPLIER UPLOADS TAB: receipts to approve, then what happens to
         the approved ones (in line to be sent, new prices, not sent)
    ============================================================ -->
    <section v-if="activeTab === 'uploads'" aria-label="Supplier uploads">
      <p v-if="supplierLoading" class="text-sm text-zinc-400">
        Loading supplier uploads...
      </p>

      <p v-if="supplierError" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
        {{ supplierError }}
      </p>

      <p v-if="supplierSuccess" class="mb-4 rounded-xl bg-emerald-600/20 p-4 text-emerald-400">
        {{ supplierSuccess }}
      </p>

      <div
        v-if="!supplierLoading && supplierUploads.length === 0"
        class="mb-8 rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
      >
        No pending supplier uploads.
      </div>

      <div v-else class="mb-8 space-y-5">
        <div
          v-for="upload in supplierUploads"
          :key="upload.id"
          class="rounded-[24px] border bg-zinc-900 p-5"
          :class="fileMissing(upload) ? 'border-amber-500/40' : 'border-white/10'"
        >
          <div class="flex items-start gap-4">
            <!-- the receipt's picture (opens it), "PDF", or why it can't be shown -->
            <a
              v-if="fileUrl(upload) && isImage(upload.file_name) && !brokenThumbs.has(upload.id)"
              :href="fileUrl(upload)"
              target="_blank"
              rel="noopener"
              class="shrink-0"
              :title="'Open ' + upload.file_name"
            >
              <img
                :src="fileUrl(upload)"
                :alt="upload.file_name"
                class="h-20 w-20 rounded-xl object-cover"
                @error="markBroken(upload)"
              />
            </a>
            <div
              v-else
              class="flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-xs font-bold"
              :class="fileMissing(upload) ? 'bg-amber-500/10 text-amber-300' : 'bg-zinc-800 text-zinc-400'"
            >
              <template v-if="fileMissing(upload)">
                <NavIcon name="alert" class="h-5 w-5" />
                File missing
              </template>
              <template v-else-if="!isImage(upload.file_name)">PDF</template>
              <template v-else-if="brokenThumbs.has(upload.id)">No preview</template>
              <template v-else>…</template>
            </div>

            <div class="min-w-0 flex-1">
              <a
                v-if="fileUrl(upload)"
                :href="fileUrl(upload)"
                target="_blank"
                rel="noopener"
                class="block truncate text-lg font-bold text-white hover:text-red-400"
              >
                {{ upload.file_name }}
              </a>
              <p v-else class="truncate text-lg font-bold text-white">{{ upload.file_name }}</p>

              <p class="mt-1 text-sm text-zinc-400">
                From: {{ upload.supplier_name || upload.supplier_email || 'Supplier' }}
              </p>

              <p class="mt-1 text-sm text-zinc-400">
                Date: {{ formatDate(upload.created_at) }}
              </p>
            </div>
          </div>

          <!-- the file left storage before it was approved (approving needs it) -->
          <p v-if="fileMissing(upload)" class="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
            This receipt's file is no longer in storage, so it can't be shown or approved. It was
            taken before you approved it, most likely by the receipt scanner. Reject it to clear
            it from this list.
          </p>

          <div class="mt-5 flex gap-3">
            <button
              class="rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              :disabled="isBusy(upload.id) || fileMissing(upload)"
              :title="fileMissing(upload) ? 'The receipt\'s file is missing' : ''"
              @click="openReview(upload, 'approve')"
            >
              {{ isBusy(upload.id) ? 'Working...' : 'Approve' }}
            </button>

            <button
              class="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="isBusy(upload.id)"
              @click="rejectSupplierUpload(upload)"
            >
              Reject
            </button>
          </div>
        </div>
      </div>

      <!-- Approved receipts waiting their turn to be sent to n8n.
           They are sent one at a time so each gets its own profit percentage. -->
      <div
        v-if="sendQueue.length > 0"
        class="mb-8 rounded-[24px] border border-sky-500/30 bg-zinc-900 p-5"
      >
        <h2 class="mb-1 text-lg font-bold text-white">Waiting to be sent to the scanner</h2>
        <p class="mb-3 text-sm text-zinc-400">
          Approved receipts are sent one at a time, about {{ SEND_GAP_MS / 1000 }} seconds
          apart, so every receipt gets its own profit percentage. Keep this page open
          until the list is empty.
        </p>

        <ul class="space-y-2">
          <li
            v-for="(item, index) in sendQueue"
            :key="item.upload.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-800 px-4 py-3 text-sm"
          >
            <span class="min-w-0 truncate font-bold text-white">
              {{ item.upload.file_name }}
              <span class="font-normal text-zinc-400">· {{ item.percent }}% profit</span>
            </span>
            <span class="shrink-0 font-bold text-sky-300">
              <template v-if="index > 0">{{ index }} ahead</template>
              <template v-else-if="secondsToNext > 0">sends in {{ secondsToNext }}s</template>
              <template v-else>sending now…</template>
            </span>
          </li>
        </ul>
      </div>

      <!-- ============================================================
           NEW PRICES TO CHECK
           Shown after n8n has finished and the products table is updated:
           every product the receipt added or restocked, with its price.
      ============================================================ -->
      <div v-if="reviewGroups.length > 0 || itemsError || itemsSuccess" class="mb-8">
        <h2 class="mb-1 text-lg font-bold text-white">New prices to check</h2>
        <p class="mb-3 text-sm text-zinc-400">
          The receipt scanner finished. These products were added or restocked. Check the
          price of each one, change it if you want, then press Confirm.
        </p>

        <p v-if="itemsError" class="mb-3 rounded-xl bg-red-600/20 p-4 text-red-400">
          {{ itemsError }}
        </p>
        <p v-if="itemsSuccess" class="mb-3 rounded-xl bg-emerald-600/20 p-4 text-emerald-400">
          {{ itemsSuccess }}
        </p>

        <!-- one short card per receipt; "Open" shows its prices in a window.
             Products the scanner added without an approved receipt get their
             own warning card, so they can't be mistaken for a receipt above. -->
        <div
          v-for="group in reviewGroups"
          :key="group.key"
          class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border bg-zinc-900 p-4 sm:p-5"
          :class="group.linked ? 'border-emerald-500/30' : 'border-amber-500/40'"
        >
          <div v-if="group.linked" class="min-w-0 flex-1 basis-48">
            <p class="truncate font-bold text-white">{{ group.fileName || `Receipt #${group.key}` }}</p>
            <p class="mt-1 text-sm text-zinc-400">
              {{ group.items.length }} product{{ group.items.length === 1 ? '' : 's' }} to check
              · Profit chosen: {{ group.percent != null ? group.percent + '%' : '—' }}
            </p>
          </div>

          <div v-else class="min-w-0 flex-1 basis-48">
            <p class="flex items-center gap-2 font-bold text-amber-300">
              <NavIcon name="alert" class="h-4 w-4 shrink-0" />
              Added without your approval
            </p>
            <p class="mt-1 text-sm text-zinc-400">
              {{ group.items.length }} product{{ group.items.length === 1 ? '' : 's' }} the receipt
              scanner added on its own, not from a receipt you approved. No profit was added to
              them: check their prices.
            </p>
          </div>

          <button
            class="rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700"
            @click="openReviewKey = group.key"
          >
            Open
          </button>
        </div>
      </div>

      <!-- Approved, but copying to the Approved Receipt bucket failed,
           so n8n never received them. Only shown when there are any. -->
      <div v-if="unsentVisible.length > 0" class="mb-8">
        <h2 class="mb-1 text-lg font-bold text-white">Approved but not sent</h2>
        <p class="mb-3 text-sm text-zinc-400">
          These were approved, but sending them to the receipt scanner failed, so it never
          received them. Press "Send again" to try once more.
        </p>

        <div class="space-y-3">
          <div
            v-for="upload in unsentVisible"
            :key="upload.id"
            class="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-amber-500/30 bg-zinc-900 p-5"
          >
            <div class="min-w-0">
              <a
                v-if="fileUrl(upload)"
                :href="fileUrl(upload)"
                target="_blank"
                rel="noopener"
                class="block truncate font-bold text-white hover:text-red-400"
              >
                {{ upload.file_name }}
              </a>
              <p v-else class="truncate font-bold text-white">{{ upload.file_name }}</p>

              <p class="mt-1 text-sm text-zinc-400">
                From: {{ upload.supplier_name || upload.supplier_email || 'Supplier' }}
                · Approved: {{ formatDate(upload.reviewed_at) }}
              </p>

              <p v-if="fileMissing(upload)" class="mt-1 text-sm font-bold text-amber-300">
                Its file is no longer in storage, so it can't be sent.
              </p>
            </div>

            <button
              class="shrink-0 rounded-2xl bg-amber-500 px-5 py-3 font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              :disabled="isBusy(upload.id) || fileMissing(upload)"
              @click="openReview(upload, 'send')"
            >
              {{ isBusy(upload.id) ? 'In line...' : 'Send again' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================
         INSPECTION APPROVALS TAB
    ============================================================ -->
    <section v-else aria-label="Inspection approvals">
      <p v-if="loading" class="text-sm text-zinc-400">
        Loading approvals...
      </p>

      <p
        v-if="errorMessage"
        class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
      >
        {{ errorMessage }}
      </p>

      <p
        v-if="successMessage"
        class="mb-4 rounded-xl bg-emerald-600/20 p-4 text-emerald-400"
      >
        {{ successMessage }}
      </p>

      <div
        v-if="!loading && approvals.length === 0"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
      >
        No pending inspection approvals.
      </div>

      <div v-else class="space-y-5">
        <div
          v-for="approval in approvals"
          :key="approval.id"
          class="rounded-[24px] border border-white/10 bg-zinc-900 p-5"
        >
          <h2 class="text-2xl font-bold text-white">
            {{ approval.product_name }}
          </h2>

          <p class="mt-2 text-sm text-zinc-400">
            Requested by: {{ approval.requested_by || 'Staff' }}
          </p>

          <p class="mt-1 text-sm text-zinc-400">
            Date: {{ formatDate(approval.created_at) }}
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <span class="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-400">
              Approved: {{ count(approval.approved_qty) }}
            </span>

            <span class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400">
              Return: {{ count(approval.return_qty) }}
            </span>

            <span class="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold text-yellow-400">
              Submitted
            </span>
          </div>

          <div class="mt-5 flex gap-3">
            <button
              class="rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              :disabled="decidingIds.has(approval.id)"
              @click="approveInspection(approval)"
            >
              {{ decidingIds.has(approval.id) ? 'Working...' : 'Approve' }}
            </button>

            <button
              class="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="decidingIds.has(approval.id)"
              @click="rejectInspection(approval)"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- PRICE CHECK WINDOW (components/ReceiptPriceCheck.vue): each product's
         category (saved at once) and new price (saved with Confirm). Closes
         by itself after Confirm / Keep: the receipt then leaves the list. -->
    <ReceiptPriceCheck
      v-if="priceWindow"
      :key="priceWindow.key"
      :group="priceWindow"
      :prices="priceEdits"
      :saving="reviewSaving.has(priceWindow.key)"
      :error="priceError"
      @price="setPrice"
      @confirm="confirmGroup(priceWindow)"
      @keep="dismissGroup(priceWindow)"
      @close="openReviewKey = null"
    />

    <!-- ============================================================
         REVIEW WINDOW: opens when Approve / Send again is pressed.
         Ask for the profit percentage, and let the owner zoom the receipt.
    ============================================================ -->
    <Teleport to="body">
      <div
        v-if="review"
        class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-3 sm:p-4"
        @click.self="closeReview"
      >
        <div class="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-2xl sm:rounded-[24px] sm:p-6">
          <h2 class="text-xl font-bold text-white sm:text-2xl">
            {{ review.mode === 'send' ? 'Send receipt again' : 'Approve receipt' }}
          </h2>

          <p class="mt-1 truncate text-sm text-zinc-400">
            {{ review.upload.file_name }} · From
            {{ review.upload.supplier_name || review.upload.supplier_email || 'Supplier' }}
          </p>

          <!-- receipt preview: click to zoom -->
          <div class="mt-4">
            <p v-if="!fileUrl(review.upload)" class="rounded-xl bg-black p-6 text-center text-sm text-zinc-400">
              {{ fileMissing(review.upload) ? "This receipt's file is no longer in storage." : 'Loading the receipt…' }}
            </p>

            <button
              v-else-if="isImage(review.upload.file_name)"
              type="button"
              class="group relative block w-full overflow-hidden rounded-xl bg-black"
              title="Click to zoom"
              @click="openZoom"
            >
              <img
                :src="fileUrl(review.upload)"
                :alt="review.upload.file_name"
                class="max-h-[40vh] w-full object-contain"
              />
              <span class="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white group-hover:bg-red-600">
                🔍 Click to zoom
              </span>
            </button>

            <div v-else class="overflow-hidden rounded-xl bg-black">
              <iframe
                :src="fileUrl(review.upload)"
                class="h-[40vh] w-full"
                title="Receipt preview"
              ></iframe>
              <a
                :href="fileUrl(review.upload)"
                target="_blank"
                rel="noopener"
                class="block py-2 text-center text-sm font-bold text-red-400 hover:underline"
              >
                Open the PDF in a new tab
              </a>
            </div>
          </div>

          <!-- profit percentage -->
          <div class="mt-5">
            <label class="mb-2 block text-sm font-bold text-zinc-300" for="profit-input">
              Profit percentage
            </label>

            <div class="flex items-center gap-2">
              <input
                id="profit-input"
                v-model="profitInput"
                type="number"
                inputmode="decimal"
                min="0"
                max="1000"
                step="0.01"
                placeholder="e.g. 25"
                class="input flex-1"
                @keyup.enter="confirmReview"
              />
              <span class="text-lg font-bold text-zinc-300">%</span>
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="quick in [10, 15, 20, 25, 30, 50]"
                :key="quick"
                type="button"
                class="rounded-xl bg-zinc-800 px-3 py-1.5 text-sm font-bold text-zinc-200 hover:bg-zinc-700"
                @click="profitInput = String(quick)"
              >
                {{ quick }}%
              </button>
            </div>

            <p class="mt-2 text-xs text-zinc-500">
              After the scanner has read the receipt, the new products appear on this
              page under "New prices to check" with this percentage already added.
              You can change any price there before confirming.
            </p>
          </div>

          <p
            v-if="reviewError"
            class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400"
          >
            {{ reviewError }}
          </p>

          <div class="mt-5 flex gap-3">
            <button
              class="flex-1 rounded-2xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700"
              @click="confirmReview"
            >
              {{ review.mode === 'send' ? 'Send' : 'Approve & send' }}
            </button>

            <button
              class="flex-1 rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
              @click="closeReview"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- FULL-SCREEN ZOOM -->
      <div
        v-if="review && zoomOpen"
        class="fixed inset-0 z-[2100] flex flex-col bg-black/95"
      >
        <div class="flex items-center justify-between gap-2 p-3">
          <div class="flex items-center gap-2">
            <button
              class="rounded-xl bg-zinc-800 px-4 py-2 text-lg font-bold text-white hover:bg-zinc-700"
              title="Zoom out"
              @click="changeZoom(-0.5)"
            >
              −
            </button>
            <span class="w-14 text-center text-sm font-bold text-zinc-300">
              {{ Math.round(zoom * 100) }}%
            </span>
            <button
              class="rounded-xl bg-zinc-800 px-4 py-2 text-lg font-bold text-white hover:bg-zinc-700"
              title="Zoom in"
              @click="changeZoom(0.5)"
            >
              +
            </button>
            <button
              class="rounded-xl bg-zinc-800 px-3 py-2 text-sm font-bold text-white hover:bg-zinc-700"
              @click="zoom = 1"
            >
              Reset
            </button>
          </div>

          <button
            class="rounded-xl bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700"
            @click="zoomOpen = false"
          >
            ✕ Close
          </button>
        </div>

        <!-- scroll to move around while zoomed in; click the picture to zoom in / out -->
        <div class="flex-1 overflow-auto p-2">
          <img
            :src="fileUrl(review.upload)"
            :alt="review.upload.file_name"
            class="mx-auto block max-w-none cursor-zoom-in select-none"
            :class="zoom > 1 ? 'cursor-zoom-out' : ''"
            :style="{ width: zoom * 100 + '%' }"
            @click="zoom = zoom >= 2 ? 1 : 2.5"
          />
        </div>
      </div>
    </Teleport>

    <!-- ============================================================
         LOADING SCREEN: shown while a receipt is being sent, read by n8n
         and written to the products table. "Continue in background"
         shrinks it to a small badge so you can keep working.
    ============================================================ -->
    <Teleport to="body">
      <div
        v-if="processing && !overlayHidden"
        class="fixed inset-0 z-[1900] flex items-center justify-center bg-black/80 p-4"
        role="status"
        aria-live="polite"
      >
        <div class="w-full max-w-md rounded-[24px] border border-white/10 bg-zinc-900 p-6 text-center shadow-2xl">
          <div class="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-zinc-700 border-t-emerald-500"></div>

          <h2 class="mt-5 text-xl font-bold text-white">{{ processingTitle }}</h2>
          <p class="mt-1 text-sm text-zinc-400">
            This usually takes a minute or two. Keep this page open: the new prices will
            appear here as soon as it's done.
          </p>

          <!-- steps -->
          <ol class="mt-5 space-y-2 text-left text-sm">
            <li
              v-for="(label, index) in processingSteps"
              :key="label"
              class="flex items-center gap-3 rounded-xl px-3 py-2"
              :class="index + 1 === processingStage ? 'bg-emerald-600/15 text-emerald-300' : index + 1 < processingStage ? 'text-zinc-400' : 'text-zinc-600'"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                :class="index + 1 < processingStage ? 'bg-emerald-600 text-white' : index + 1 === processingStage ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-500'"
              >
                {{ index + 1 < processingStage ? '✓' : index + 1 }}
              </span>
              <span class="font-bold">{{ label }}</span>
            </li>
          </ol>

          <!-- each receipt -->
          <ul v-if="processingList.length > 0" class="mt-4 space-y-2 text-left">
            <li
              v-for="entry in processingList"
              :key="entry.key"
              class="rounded-xl bg-zinc-800 px-3 py-2 text-sm"
            >
              <p class="truncate font-bold text-white">{{ entry.name }}</p>
              <p class="text-xs text-zinc-400">{{ entry.text }}</p>
            </li>
          </ul>

          <button
            class="mt-5 w-full rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
            @click="overlayHidden = true"
          >
            Continue in background
          </button>
        </div>
      </div>

      <button
        v-else-if="processing"
        class="fixed bottom-4 right-4 z-[1900] flex items-center gap-3 rounded-full border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-2xl hover:bg-zinc-800"
        @click="overlayHidden = false"
      >
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500"></span>
        Processing receipt…
      </button>

      <!-- LEAVE QUESTION: receipts in line are sent from this page -->
      <div
        v-if="leavePrompt"
        class="fixed inset-0 z-[2200] flex items-center justify-center bg-black/80 p-4"
        @click.self="answerLeave(false)"
      >
        <div
          class="w-full max-w-md rounded-[24px] border border-amber-500/30 bg-zinc-900 p-6 shadow-2xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="leave-title"
        >
          <h2 id="leave-title" class="text-xl font-bold text-white">Receipts are still being sent</h2>

          <p class="mt-2 text-sm leading-relaxed text-zinc-400">
            {{ waitingCount }} receipt{{ waitingCount === 1 ? ' is' : 's are' }} waiting to go to
            the receipt scanner. They are sent from this page, so if you leave now they stop and
            wait under "Approved but not sent" until you press "Send again".
          </p>

          <div class="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              class="flex-1 rounded-2xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700"
              @click="answerLeave(false)"
            >
              Stay on this page
            </button>

            <button
              class="flex-1 rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
              @click="answerLeave(true)"
            >
              Leave anyway
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { supabase, uniqueChannelName } from '../../lib/supabase'
import { useQueryParam } from '../../lib/useQueryParam'
import { setLeaveQuestion } from '../../lib/leaveGuard'
import { count } from '../../lib/format'
import {
  APPROVED_BUCKET,
  LINK_SECONDS,
  RECEIPT_BUCKET,
  isImageFile,
  isMissingFile,
  safeFileName,
  signReceiptLinks,
} from '../../lib/receipts'
import { startingPrice } from '../../lib/receiptPrices'
import PageHeader from '../../components/PageHeader.vue'
import NavIcon from '../../components/NavIcon.vue'
import ReceiptPriceCheck from '../../components/ReceiptPriceCheck.vue'

/* ------------------------------------------------------------------
   Inspection approvals (unchanged)
------------------------------------------------------------------ */
const approvals = ref([])
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function fetchApprovals() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const { data, error } = await supabase.rpc('list_submitted_approvals')

  if (error) {
    errorMessage.value = error.message
    approvals.value = []
  } else {
    approvals.value = data || []
  }

  loading.value = false
}

// Inspections being approved / rejected right now: their buttons are
// greyed out, so a double tap can't send the decision twice (the second
// one used to show 'already reviewed' after the first had worked).
const decidingIds = ref(new Set())

async function decideInspection(approval, rpc, params, doneText) {
  if (decidingIds.value.has(approval.id)) return

  errorMessage.value = ''
  successMessage.value = ''
  decidingIds.value.add(approval.id)

  const { error } = await supabase.rpc(rpc, params)

  if (error) {
    decidingIds.value.delete(approval.id)
    // e.g. "Approved + Return cannot exceed product quantity"
    errorMessage.value = error.message
    return
  }

  // refresh first: fetchApprovals clears the messages when it starts, so
  // a message set before it used to vanish straight away
  await fetchApprovals()
  decidingIds.value.delete(approval.id)
  successMessage.value = doneText
}

function approveInspection(approval) {
  return decideInspection(approval, 'approve_inspection', {
    p_approval_id: approval.id,
    p_approved_qty: Number(approval.approved_qty || 0),
    p_return_qty: Number(approval.return_qty || 0),
  }, 'Inspection approved successfully.')
}

function rejectInspection(approval) {
  return decideInspection(approval, 'reject_inspection', {
    p_approval_id: approval.id,
  }, 'Inspection rejected.')
}

/* ------------------------------------------------------------------
   Supplier uploads

   Approve: downloads the file to this device, marks it approved,
   copies it into the "Approved Receipt" bucket (a Supabase Database Webhook
   on that bucket triggers the n8n workflow), then deletes the original.
   Reject: just marks it rejected. SupplierDropBoxView.vue is listening
   for this via realtime and alerts the supplier itself — nothing else
   needs to happen here for that part.

   If the copy fails, the upload is still approved; it's listed under
   "Approved but not sent" until "Send again" gets it through.
------------------------------------------------------------------ */
const BUCKET = RECEIPT_BUCKET

// Approved receipts are copied to APPROVED_BUCKET ('Approved Receipt').
// A file landing there is what should start the receipt scanner (n8n).

/* ------------------------------------------------------------------
   Receipt links for showing a receipt on this page: signed links made for
   the owner from the receipt's place in storage (lib/receipts.js). They
   work whether or not the bucket is public, and the answer also says when
   a file isn't in storage any more, so the page says so instead of showing
   a broken picture. The link saved with an upload is never used: a supplier
   calling the database directly could have saved any website there.
------------------------------------------------------------------ */
const fileLinks = ref(new Map()) // upload id -> { url, missing, at }
const brokenThumbs = ref(new Set()) // pictures the browser couldn't show

function fileUrl(upload) {
  return fileLinks.value.get(upload?.id)?.url || ''
}

function fileMissing(upload) {
  return fileLinks.value.get(upload?.id)?.missing === true
}

function markMissing(upload) {
  const next = new Map(fileLinks.value)
  next.set(upload.id, { url: '', missing: true, at: Date.now() })
  fileLinks.value = next
}

function markBroken(upload) {
  brokenThumbs.value = new Set(brokenThumbs.value).add(upload.id)
}

// One request for all the receipts shown. A link that still works is kept
// (the pictures don't reload); a file gone since is marked missing at once.
async function refreshFileLinks(uploads) {
  const list = uploads.filter((upload) => upload?.file_path)
  if (list.length === 0) return

  let links
  try {
    links = await signReceiptLinks(list.map((upload) => upload.file_path))
  } catch (error) {
    // no connection etc.: keep what's shown, call nothing missing
    console.error('Could not make the receipt links:', error)
    return
  }

  const now = Date.now()
  const next = new Map(fileLinks.value)

  for (const upload of list) {
    const link = links.get(upload.file_path)
    const before = next.get(upload.id)
    const stillGood = before?.url && now - before.at < (LINK_SECONDS * 1000) / 2

    if (!link) next.set(upload.id, { url: '', missing: true, at: now })
    else if (!stillGood) next.set(upload.id, { url: link, missing: false, at: now })
  }

  fileLinks.value = next
}

const supplierUploads = ref([])
const unsentUploads = ref([]) // approved, but never reached the Approved Receipt bucket
const supplierLoading = ref(false)
const supplierError = ref('')
const supplierSuccess = ref('')
const busyIds = ref(new Set())

let uploadsChannel = null

/* ------------------------------------------------------------------
   Review window (profit percentage + zoom)
   Approve / Send again open it first; nothing is sent until the owner
   confirms. The percentage is NOT sent to n8n: it is saved in the database
   (receipt_markups) and the database adds it to the price of the new
   products n8n creates. n8n only sees the receipt itself.
------------------------------------------------------------------ */
const review = ref(null) // { upload, mode: 'approve' | 'send' }
const profitInput = ref('')
const reviewError = ref('')
const zoomOpen = ref(false)
const zoom = ref(1)

function openReview(upload, mode) {
  review.value = { upload, mode }
  profitInput.value = ''
  reviewError.value = ''
  zoomOpen.value = false
  zoom.value = 1

  // no link yet (e.g. the list was just loaded): make it for the preview
  if (!fileUrl(upload)) refreshFileLinks([upload])
}

function closeReview() {
  review.value = null
  zoomOpen.value = false
}

function openZoom() {
  zoom.value = 1
  zoomOpen.value = true
}

function changeZoom(step) {
  zoom.value = Math.min(5, Math.max(0.5, zoom.value + step))
}

function confirmReview() {
  const raw = String(profitInput.value).trim()
  const percent = Number(raw)

  if (raw === '' || !Number.isFinite(percent)) {
    reviewError.value = 'Please enter the profit percentage.'
    return
  }

  if (percent < 0 || percent > 1000) {
    reviewError.value = 'The percentage must be between 0 and 1000.'
    return
  }

  // keep at most 2 decimals (25.456 -> 25.46)
  const clean = Math.round(percent * 100) / 100
  const { upload, mode } = review.value

  closeReview()

  if (mode === 'send') {
    resendSupplierUpload(upload, clean)
  } else {
    approveSupplierUpload(upload, clean)
  }
}

// Esc closes the top-most window: the leave question, the zoom, the
// profit window, then the price window.
function onKey(event) {
  if (event.key !== 'Escape') return

  if (leavePrompt.value) answerLeave(false)
  else if (zoomOpen.value) zoomOpen.value = false
  else if (review.value) closeReview()
  else if (priceWindow.value) openReviewKey.value = null
}

function isBusy(id) {
  return busyIds.value.has(id)
}

function isImage(fileName) {
  return isImageFile(fileName)
}

// Several suppliers can upload at the same moment, which fires several
// refreshes at once. Only the newest answer is used, so an older, slower
// answer can never overwrite a newer list. "silent" refreshes (realtime,
// timer) don't flash "Loading..." and never wipe the list on a hiccup.
let fetchSeq = 0

async function fetchSupplierUploads({ silent = false } = {}) {
  const seq = ++fetchSeq

  if (!silent) {
    supplierLoading.value = true
    supplierError.value = ''
  }

  const { data, error } = await supabase.rpc('admin_list_supplier_uploads', {
    p_status: 'pending',
  })

  if (seq !== fetchSeq) return // a newer refresh is already running

  if (error) {
    if (!silent) {
      supplierError.value = error.message
      supplierUploads.value = []
    } else {
      console.error(error)
    }
  } else {
    supplierUploads.value = data || []
    refreshFileLinks(supplierUploads.value)
  }

  supplierLoading.value = false
}

// Reads a receipt from storage into memory, as the logged-in owner (never
// through a saved link, and with no link that could have expired).
async function fetchReceipt(upload) {
  if (!upload?.file_path) throw new Error('This upload has no file.')

  const { data, error } = await supabase.storage.from(BUCKET).download(upload.file_path)

  if (error || !data) {
    if (isMissingFile(error)) {
      markMissing(upload)
      throw new Error(`"${upload.file_name}" is no longer in storage, so it can't be sent. Reject it to clear it.`)
    }
    throw new Error('Could not download the file.')
  }

  return data
}

// Saves the receipt to this device before it's deleted from storage —
// once deleted there's no other way to get it back.
function saveToDevice(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName || 'supplier-upload'
  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(objectUrl)
}

async function approveSupplierUpload(upload, profitPercent) {
  supplierError.value = ''
  supplierSuccess.value = ''
  busyIds.value.add(upload.id)
  preparing.value += 1
  showProcessing()

  try {
    // 1. save a copy locally before anything is deleted (the same copy is
    //    then sent to the Approved Receipt bucket)
    const blob = await fetchReceipt(upload)
    saveToDevice(blob, upload.file_name)

    // 2. mark approved
    const { data: approved, error } = await supabase.rpc('admin_approve_supplier_upload', {
      p_upload_id: upload.id,
    })

    if (error) throw new Error(error.message)

    supplierUploads.value = supplierUploads.value.filter((item) => item.id !== upload.id)

    // 3. line it up to be sent to n8n (one receipt at a time)
    enqueueSend({ upload: approved, blob, percent: profitPercent, mode: 'approve' })

    supplierSuccess.value = `Approved "${upload.file_name}" and saved it to your device. It is in line to be sent to the receipt scanner.`
  } catch (err) {
    busyIds.value.delete(upload.id)
    supplierError.value = err.message || 'Something went wrong approving this upload.'
  } finally {
    preparing.value -= 1
  }
}

/* ------------------------------------------------------------------
   Send queue

   The database gives a new product the NEWEST profit percentage saved in the
   last 15 minutes. If two receipts were sent to n8n at the same moment,
   their products could get each other's percentage. So receipts are sent one
   at a time, SEND_GAP_MS apart: each receipt's percentage is saved right
   before that receipt is sent, and n8n has time to finish the previous one.
   Raise SEND_GAP_MS if n8n takes longer than this to read a receipt.

   If the page is closed while receipts are waiting, they stay approved and
   show up under "Approved but not sent" for "Send again".
------------------------------------------------------------------ */
const SEND_GAP_MS = 90 * 1000

const sendQueue = ref([]) // { upload, blob, percent, mode }
const nextSendAt = ref(0)
const nowTick = ref(Date.now())
let queueRunning = false
let isMounted = true
let tickTimer = null
let pollTimer = null
let refreshTimer = null

const secondsToNext = computed(() =>
  Math.max(0, Math.ceil((nextSendAt.value - nowTick.value) / 1000))
)

function isQueued(id) {
  return sendQueue.value.some((item) => item.upload.id === id)
}

// "Approved but not sent" minus the ones that are in line right now
const unsentVisible = computed(() =>
  unsentUploads.value.filter((item) => !isQueued(item.id))
)

function enqueueSend(item) {
  sendQueue.value.push(item)
  publishSchedule()
  runSendQueue()
}

async function runSendQueue() {
  if (queueRunning) return
  queueRunning = true

  while (isMounted && sendQueue.value.length > 0) {
    publishSchedule() // times change after every send
    const wait = nextSendAt.value - Date.now()

    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
      if (!isMounted) break
    }

    const item = sendQueue.value[0]
    const sent = await sendQueued(item)

    sendQueue.value.shift()

    // only wait before the next one when this one really reached n8n
    if (sent) nextSendAt.value = Date.now() + SEND_GAP_MS
  }

  queueRunning = false
}

// Saves when each receipt in line will be sent, so the supplier sees a
// countdown on their page. Sending doesn't depend on it: if saving fails
// (e.g. the 2026-10-19 supplier_send_timer SQL wasn't run yet) it's only logged.
function publishSchedule() {
  // page already left: nothing in line will be sent, so promise no times
  if (!isMounted) return

  const first = Math.max(0, nextSendAt.value - Date.now())

  saveSchedule(
    sendQueue.value.map((item, index) => ({
      id: item.upload.id,
      seconds: Math.ceil((first + index * SEND_GAP_MS) / 1000),
    }))
  )
}

// No longer in line: the supplier's countdown goes away.
function clearSchedule(uploads) {
  saveSchedule(uploads.map((upload) => ({ id: upload.id, seconds: null })))
}

async function saveSchedule(schedule) {
  if (schedule.length === 0) return

  const { error } = await supabase.rpc('admin_schedule_supplier_uploads', {
    p_schedule: schedule,
  })

  if (error) console.error('Could not save the send times for the supplier:', error)
}

// Sends one queued receipt. Returns true when it reached the Approved Receipt bucket.
async function sendQueued(item) {
  const { upload, mode } = item

  try {
    const blob = item.blob || (await fetchReceipt(upload))
    const { deleteFailed, newlySent } = await forwardReceipt(upload, blob, item.percent)

    if (newlySent) startScanning(upload)

    unsentUploads.value = unsentUploads.value.filter((entry) => entry.id !== upload.id)

    supplierError.value = ''
    supplierSuccess.value = deleteFailed
      ? `Sent "${upload.file_name}" to the receipt scanner. Its original couldn't be removed from storage: check the bucket's delete policy.`
      : `Sent "${upload.file_name}" to the receipt scanner.`

    return true
  } catch (sendError) {
    console.error('Could not send to the Approved Receipt bucket:', sendError)

    if (!sendError.alreadySent) clearSchedule([upload])

    if (sendError.alreadySent) {
      supplierError.value =
        `"${upload.file_name}" reached the receipt scanner, but the app couldn't record that ` +
        `it was sent (${sendError.message}). If it's listed under "Approved but not sent", ` +
        `press "Send again": that only records it, it won't be sent twice.`
    } else if (mode === 'send') {
      supplierError.value = `Sending "${upload.file_name}" failed again: ${sendError.message || sendError}`
    } else {
      supplierError.value =
        `"${upload.file_name}" was approved and saved to your device, but sending it to the ` +
        `receipt scanner failed (${sendError.message}). It's listed under ` +
        `"Approved but not sent": press "Send again" to retry.`
    }

    await fetchUnsentUploads()
    return Boolean(sendError.alreadySent)
  } finally {
    busyIds.value.delete(upload.id)
  }
}

// Copies an approved receipt into the "Approved Receipt" bucket (that copy
// is what triggers n8n), records it as sent, then removes the original.
// Before the copy, the owner's profit percentage is saved in the database;
// the database applies it to the prices of the new products.
// Throws when it couldn't be sent and recorded; the original is kept then,
// so "Send again" can still read it.
async function forwardReceipt(upload, blob, profitPercent) {
  // Plain file name: n8n gets only the receipt, no percentage.
  const approvedPath = `${upload.id}-${safeFileName(upload.file_name)}`

  // If an earlier try already put this receipt in the bucket, don't send it
  // a second time: that would add the stock twice.
  const { data: existing } = await supabase.storage
    .from(APPROVED_BUCKET)
    .list('', { search: `${upload.id}-` })

  const alreadyThere = (existing || []).some((file) =>
    file.name.startsWith(`${upload.id}-`)
  )

  // Save the percentage first. If this fails, nothing is sent, so a receipt
  // can never reach n8n without its markup.
  if (!alreadyThere) {
    const { error: markupError } = await supabase.rpc('admin_set_receipt_markup', {
      p_upload_ref: String(upload.id),
      p_percent: profitPercent,
    })

    if (markupError) {
      throw new Error(`Could not save the profit percentage (${markupError.message})`)
    }
  }

  const { error: uploadError } = alreadyThere
    ? { error: null }
    : await supabase.storage.from(APPROVED_BUCKET).upload(approvedPath, blob, {
        contentType: blob.type || undefined,
        upsert: false,
      })

  // "Already exists" means an earlier try did copy it and only recording it
  // failed. It already reached n8n, so count it as sent instead of sending
  // it twice (which would add its stock twice).
  if (uploadError && !isAlreadyExists(uploadError)) {
    throw uploadError
  }

  const { error: markError } = await supabase.rpc('admin_mark_supplier_upload_forwarded', {
    p_upload_id: upload.id,
  })

  if (markError) {
    const notRecorded = new Error(markError.message)
    notRecorded.alreadySent = true
    throw notRecorded
  }

  const { data: removed, error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([upload.file_path])

  // .remove() can resolve with no error but an empty `removed` array —
  // that also means nothing was actually deleted (e.g. a storage RLS
  // policy silently blocked it), so both cases are checked here rather
  // than just the error.
  const deleteFailed = Boolean(removeError || !removed || removed.length === 0)

  if (deleteFailed) {
    console.error('Sent, but failed to delete the original from storage:', removeError)
  }

  return { deleteFailed, newlySent: !alreadyThere }
}

function isAlreadyExists(error) {
  return (
    String(error?.statusCode) === '409' ||
    error?.status === 409 ||
    /already exists|duplicate/i.test(error?.message || '')
  )
}

async function fetchUnsentUploads() {
  const { data, error } = await supabase.rpc('admin_list_unsent_supplier_uploads')

  if (error) {
    // e.g. the 2026-10-15 SQL file hasn't been run yet: just hide the list
    console.error(error)
    unsentUploads.value = []
    return
  }

  unsentUploads.value = data || []
  refreshFileLinks(unsentUploads.value)
}

async function resendSupplierUpload(upload, profitPercent) {
  supplierError.value = ''
  supplierSuccess.value = ''
  busyIds.value.add(upload.id)

  enqueueSend({ upload, blob: null, percent: profitPercent, mode: 'send' })
  showProcessing()

  supplierSuccess.value = `"${upload.file_name}" is in line to be sent to the receipt scanner.`
}

async function rejectSupplierUpload(upload) {
  supplierError.value = ''
  supplierSuccess.value = ''
  busyIds.value.add(upload.id)

  const { error } = await supabase.rpc('admin_reject_supplier_upload', {
    p_upload_id: upload.id,
  })

  if (error) {
    busyIds.value.delete(upload.id)
    supplierError.value = error.message
    return
  }

  // rejected uploads aren't kept — delete the file from storage too
  // (unless it's already gone: then there's nothing to delete)
  const alreadyGone = fileMissing(upload)

  const { data: removed, error: removeError } = alreadyGone
    ? { data: [], error: null }
    : await supabase.storage.from(BUCKET).remove([upload.file_path])

  // .remove() can resolve with no error but an empty `removed` array —
  // that also means nothing was actually deleted (e.g. a storage RLS
  // policy silently blocked it), so both cases are checked here rather
  // than just the error.
  const deleteFailed = !alreadyGone && (removeError || !removed || removed.length === 0)

  if (deleteFailed) {
    console.error('Rejected, but failed to delete file from storage:', removeError)
  }

  busyIds.value.delete(upload.id)

  if (alreadyGone) supplierSuccess.value = `Rejected "${upload.file_name}". Its file was already gone from storage.`
  else if (deleteFailed) supplierSuccess.value = `Rejected "${upload.file_name}", but it's still sitting in storage — check the bucket's delete policy.`
  else supplierSuccess.value = `Rejected "${upload.file_name}" and removed it from storage.`

  supplierUploads.value = supplierUploads.value.filter((item) => item.id !== upload.id)
}

/* ------------------------------------------------------------------
   New prices to check

   When n8n has finished, every product it added or restocked is listed
   here (the database writes them to receipt_review_items). The owner can
   change any price, then Confirm. The page looks for new ones every
   10 seconds, so they appear by themselves a little after the receipt is sent.
------------------------------------------------------------------ */
const reviewItems = ref([])
const priceEdits = ref({}) // item id -> what is typed in the price box
const reviewSaving = ref(new Set()) // group keys being saved

// Receipts that were sent to n8n and are still being read / written to products
const SCAN_TIMEOUT_MS = 3 * 60 * 1000
const scanning = ref([]) // { ref, name, baseline, found, stable, startedAt }
const preparing = ref(0) // receipts being downloaded / approved right now
const overlayHidden = ref(false)
const itemsError = ref('')
const itemsSuccess = ref('')
let reviewPollTimer = null

// The receipt whose prices are open in the window (null = window closed).
// When it's confirmed or kept as is it leaves reviewGroups, which closes
// the window by itself.
const openReviewKey = ref(null)
const priceWindow = computed(() =>
  reviewGroups.value.find((group) => group.key === openReviewKey.value) || null
)

const reviewGroups = computed(() => {
  const groups = new Map()

  for (const item of reviewItems.value) {
    const key = item.upload_ref || 'other'

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        // From a receipt the owner approved: the database links the scanner's
        // products to a receipt approved in the last 15 minutes. With none,
        // the scanner was started some other way (not by an approval).
        linked: Boolean(item.upload_ref),
        fileName: item.file_name,
        percent: item.percent,
        items: [],
      })
    }

    groups.get(key).items.push(item)
  }

  return [...groups.values()]
})

// lock page scrolling behind the windows (placed after reviewGroups: the
// watch reads priceWindow right away, which needs reviewGroups to exist)
watch(
  () => Boolean(review.value || priceWindow.value),
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  }
)

async function fetchReviewItems() {
  const { data, error } = await supabase.rpc('admin_list_receipt_review')

  if (error) {
    // e.g. 7-receipt-review.sql hasn't been run yet: just hide the section
    console.error(error)
    updateScanning()
    return
  }

  reviewItems.value = data || []

  // new rows get their starting price in the box (restocked products: cost +
  // the receipt's percentage, lib/receiptPrices.js); boxes already edited are kept
  const edits = { ...priceEdits.value }
  for (const item of reviewItems.value) {
    if (!(item.id in edits)) edits[item.id] = startingPrice(item)
  }
  priceEdits.value = edits

  updateScanning()
}

// A receipt was just sent to n8n: wait for its products to show up.
function startScanning(upload) {
  const key = String(upload.id)
  const baseline = reviewItems.value.filter((item) => item.upload_ref === key).length

  scanning.value.push({
    ref: key,
    name: upload.file_name,
    baseline,
    found: baseline,
    stable: 0,
    startedAt: Date.now(),
  })

  fetchReviewItems()
}

// Done when products have appeared and no more are coming (two checks in a row
// with the same count). Gives up after SCAN_TIMEOUT_MS with a clear message.
function updateScanning() {
  if (scanning.value.length === 0) return

  const finished = []

  for (const entry of scanning.value) {
    const itemsNow = reviewItems.value.filter((item) => item.upload_ref === entry.ref).length

    if (itemsNow > entry.baseline) {
      if (itemsNow === entry.found) {
        entry.stable += 1
      } else {
        entry.found = itemsNow
        entry.stable = 0
      }

      if (entry.stable >= 1) {
        finished.push(entry)
        itemsError.value = ''
        itemsSuccess.value = `"${entry.name}": ${itemsNow - entry.baseline} product${itemsNow - entry.baseline === 1 ? '' : 's'} updated. Press Open to check the prices.`
      }
    } else if (Date.now() - entry.startedAt > SCAN_TIMEOUT_MS) {
      finished.push(entry)
      itemsSuccess.value = ''
      itemsError.value =
        `No products from "${entry.name}" yet after 3 minutes. The receipt scanner may still be ` +
        `busy: they'll show up here by themselves when it's done. If they never do, ask the ` +
        `person who looks after the receipt scanner to check it.`
    }
  }

  if (finished.length > 0) {
    scanning.value = scanning.value.filter((entry) => !finished.includes(entry))
  }
}

/* ---- loading screen ---- */
const processing = computed(
  () => preparing.value > 0 || sendQueue.value.length > 0 || scanning.value.length > 0
)

// what the owner sees: no tool names, just what's happening to the receipt
const processingSteps = ['Sending the receipt', 'Reading the receipt', 'Updating your products']

// 1 = sending, 2 = the scanner is reading it, 3 = products are being updated
const processingStage = computed(() => {
  if (preparing.value > 0 || sendQueue.value.length > 0) return 1
  if (scanning.value.some((entry) => entry.found <= entry.baseline)) return 2
  return 3
})

const processingTitle = computed(() => processingSteps[processingStage.value - 1] + '…')

const processingList = computed(() => {
  const list = sendQueue.value.map((item, index) => ({
    key: 'q' + item.upload.id,
    name: item.upload.file_name,
    text:
      index > 0
        ? `In line · ${index} ahead`
        : secondsToNext.value > 0
          ? `Sends in ${secondsToNext.value}s`
          : 'Sending…',
  }))

  for (const entry of scanning.value) {
    const added = entry.found - entry.baseline
    list.push({
      key: 's' + entry.ref,
      name: entry.name,
      text: added > 0 ? `Updating products · ${added} so far` : 'Reading the receipt…',
    })
  }

  return list
})

// The full-screen view comes back only when the owner adds a receipt
// (approve / Send again: showProcessing below). Before, it came back on
// every send of a receipt already in line, after 'Continue in background'.
function showProcessing() {
  overlayHidden.value = false
}

/* ---- the price check window (components/ReceiptPriceCheck.vue) ---- */
// why Confirm / Keep didn't work, shown inside the window
const priceError = ref('')

// a new window starts without the last one's message
watch(openReviewKey, () => {
  priceError.value = ''
})

function setPrice(id, value) {
  priceEdits.value = { ...priceEdits.value, [id]: value }
}

function removeGroup(group) {
  const ids = new Set(group.items.map((item) => item.id))
  reviewItems.value = reviewItems.value.filter((item) => !ids.has(item.id))
}

async function confirmGroup(group) {
  priceError.value = ''
  itemsError.value = ''
  itemsSuccess.value = ''

  const items = group.items.map((item) => ({
    id: item.id,
    price: Number(priceEdits.value[item.id]),
  }))

  if (items.some((item) => !Number.isFinite(item.price) || item.price < 0)) {
    priceError.value = 'Every price must be a number, 0 or more.'
    return
  }

  reviewSaving.value.add(group.key)

  const { error } = await supabase.rpc('admin_confirm_receipt_review', { p_items: items })

  reviewSaving.value.delete(group.key)

  if (error) {
    priceError.value = `Couldn't save the prices: ${error.message}`
    return
  }

  removeGroup(group)
  itemsSuccess.value = `Prices saved for ${items.length} product${items.length === 1 ? '' : 's'}.`
}

async function dismissGroup(group) {
  priceError.value = ''
  itemsError.value = ''
  itemsSuccess.value = ''
  reviewSaving.value.add(group.key)

  const { error } = await supabase.rpc('admin_dismiss_receipt_review', {
    p_ids: group.items.map((item) => item.id),
  })

  reviewSaving.value.delete(group.key)

  if (error) {
    priceError.value = `Couldn't close this check: ${error.message}`
    return
  }

  removeGroup(group)
  itemsSuccess.value = 'Kept the current prices.'
}

/* ------------------------------------------------------------------
   Tabs: Supplier Uploads | Inspection Approvals

   The open tab is kept in the address (?tab=inspections), so a refresh
   keeps it and a notification opens the right one (lib/useQueryParam.js).
------------------------------------------------------------------ */
const activeTab = useQueryParam('tab', 'uploads', ['uploads', 'inspections'])

function openTab(key) {
  activeTab.value = key
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// The number on each tab is what's waiting there. Supplier Uploads counts
// uploads to review, receipts with new prices to check, and receipts
// approved but not sent (its tooltip says which).
const tabs = computed(() => {
  const toReview = supplierUploads.value.length
  const toPrice = reviewGroups.value.length
  const notSent = unsentVisible.value.length
  const inspections = approvals.value.length

  return [
    {
      key: 'uploads',
      label: 'Supplier Uploads',
      short: 'Uploads',
      count: toReview + toPrice + notSent,
      hint:
        [
          toReview && `${plural(toReview, 'upload')} to review`,
          toPrice && `${plural(toPrice, 'receipt')} with new prices to check`,
          notSent && `${plural(notSent, 'receipt')} approved but not sent`,
        ]
          .filter(Boolean)
          .join(' · ') || 'Nothing waiting',
    },
    {
      key: 'inspections',
      label: 'Inspection Approvals',
      short: 'Inspections',
      count: inspections,
      hint: inspections ? `${plural(inspections, 'inspection')} to review` : 'Nothing waiting',
    },
  ]
})

/* ------------------------------------------------------------------
   Leaving the page while receipts are in line

   Receipts in line are sent from this page, so leaving it stops them (they
   then wait under "Approved but not sent"). Ask first: inside the app
   (links, Back, Logout) with our own window, and when closing the tab or
   reloading with the browser's own question.
------------------------------------------------------------------ */
const leavePrompt = ref(null) // while the question is shown: the function that answers it

const waitingCount = computed(() => preparing.value + sendQueue.value.length)

// resolves true = leave, false = stay
function askToLeave() {
  if (waitingCount.value === 0) return Promise.resolve(true)

  leavePrompt.value?.(false) // a newer question replaces an older one

  return new Promise((resolve) => {
    leavePrompt.value = resolve
  })
}

function answerLeave(leave) {
  const resolve = leavePrompt.value
  leavePrompt.value = null
  resolve?.(leave)
}

onBeforeRouteLeave(async () => {
  if (waitingCount.value === 0) return true

  // already logged out (Logout asked first; the auto-logout doesn't ask)
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return true

  return askToLeave()
})

const stopLeaveQuestion = setLeaveQuestion(askToLeave)

function onBeforeUnload(event) {
  if (waitingCount.value === 0) return
  event.preventDefault()
  event.returnValue = '' // older browsers need this to show the question
}

// Suppliers can upload at the same moment, so every change is refreshed once
// (bursts are merged into one refresh) without needing a manual reload.
function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => fetchSupplierUploads({ silent: true }), 250)
}

function setupSupplierRealtime() {
  uploadsChannel = supabase
    .channel(uniqueChannelName('supplier-uploads-admin'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'supplier_uploads' },
      scheduleRefresh
    )
    .subscribe()
}

/* ------------------------------------------------------------------ */
function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

onMounted(() => {
  isMounted = true
  fetchApprovals()
  fetchSupplierUploads()
  fetchUnsentUploads()
  fetchReviewItems()
  setupSupplierRealtime()
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)

  // safety net: if a live update is ever missed, the list still catches up
  pollTimer = setInterval(() => fetchSupplierUploads({ silent: true }), 30000)
  // every 3 seconds while a receipt is being processed, otherwise every 10
  let pollCount = 0
  reviewPollTimer = setInterval(() => {
    pollCount += 1
    if (scanning.value.length > 0 || pollCount % 3 === 0) fetchReviewItems()
  }, 3000)
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  isMounted = false
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
  stopLeaveQuestion()
  document.body.style.overflow = ''

  // receipts still in line won't be sent now: stop the suppliers' countdowns
  clearSchedule(sendQueue.value.map((item) => item.upload))

  clearTimeout(refreshTimer)
  clearInterval(pollTimer)
  clearInterval(tickTimer)
  clearInterval(reviewPollTimer)

  if (uploadsChannel) supabase.removeChannel(uploadsChannel)
})
</script>