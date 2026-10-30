<template>
  <div>
    <PageHeader title="Inventory" subtitle="Manage and monitor all hardware products." />

    <!-- TOP ACTIONS -->
    <!-- phones: search on its own line, the two buttons below it -->
    <div class="mb-4 flex flex-wrap gap-3">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search product or category..."
        class="min-w-0 basis-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500 sm:basis-0 sm:flex-1"
      />

      <button
        class="flex-1 rounded-2xl border border-white/10 bg-zinc-900 px-5 py-3 font-bold text-zinc-200 hover:bg-zinc-800 sm:flex-none"
        title="Every stock change, for all products"
        @click="openHistory(null)"
      >
        Stock History
      </button>

      <button
        class="flex-1 rounded-2xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 sm:flex-none"
        @click="showAddModal = true"
      >
        + Add Product
      </button>
    </div>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <!-- CATEGORY FILTER -->
    <div class="mb-5 flex gap-3 overflow-x-auto pb-2">
      <button
        v-for="category in categories"
        :key="category"
        class="rounded-full border px-4 py-2 text-sm font-bold transition"
        :class="
          selectedCategory === category
            ? 'border-red-600 bg-red-600 text-white'
            : 'border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
        "
        @click="selectedCategory = category"
      >
        {{ category }}
      </button>
    </div>

    <!-- PRODUCT TABLE: 10, 15 or all products a page
         (@container: the buttons below adapt to the table's own width) -->
    <div ref="tableTop" class="card @container overflow-hidden">
      <div class="overflow-x-auto">
        <table class="data-table resp-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th class="num">Price</th>
              <th class="num">Stock</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="product in visibleProducts" :key="product.id">
              <td class="cell-main">
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    v-if="product.image_url"
                    :src="product.image_url"
                    :alt="product.name"
                    class="list-thumb"
                    loading="lazy"
                  />
                  <span
                    v-else
                    class="list-thumb grid place-items-center text-[0.6rem] text-zinc-500"
                  >
                    No Image
                  </span>

                  <div class="min-w-0">
                    <!-- nickname on top (if any), real product name below it -->
                    <p v-if="product.nickname" class="font-bold text-white">
                      {{ product.nickname }}
                    </p>
                    <p :class="product.nickname ? 'text-sm text-zinc-300' : 'font-bold text-white'">
                      {{ product.name }}
                    </p>
                  </div>
                </div>
              </td>

              <td data-label="Category" class="text-sm text-zinc-400">
                {{ product.category || 'Uncategorized' }}
              </td>

              <td data-label="Price" class="num text-sm font-bold text-red-400">
                {{ peso(product.price || 0) }}
              </td>

              <td data-label="Stock" class="num text-sm font-bold">
                <!-- one piece, so on phones "low" stays next to the number -->
                <span :class="Number(product.quantity) <= 10 ? 'text-red-400' : 'text-white'">
                  {{ count(product.quantity) }}
                  <span
                    v-if="Number(product.quantity) <= 10"
                    class="ml-1 text-[0.6rem] uppercase tracking-wide"
                    >low</span
                  >
                </span>
              </td>

              <td class="cell-actions">
                <div class="row-actions">
                  <button
                    class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    @click="openStockModal(product)"
                  >
                    Add Stock
                  </button>

                  <!-- phones: in the "More" menu instead -->
                  <button
                    class="desktop-only rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                    title="Edit name, price, quantity and picture"
                    @click="openEditModal(product)"
                  >
                    ✎ Edit
                  </button>

                  <!-- a narrower table (small laptop, phone): in the "More" menu instead -->
                  <button
                    class="desktop-only rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700 @max-5xl:hidden"
                    title="Set the inspection date or report the product"
                    @click="openModal(product)"
                  >
                    📅 Inspection
                  </button>

                  <button
                    class="desktop-only rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700 @max-5xl:hidden"
                    title="Every stock change for this product"
                    @click="openHistory(product)"
                  >
                    History
                  </button>

                  <button
                    class="desktop-only rounded-lg bg-red-600/15 px-2.5 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30 hover:text-white @max-5xl:hidden"
                    title="Move this product to Archived"
                    @click="openArchiveModal(product)"
                  >
                    Archive
                  </button>

                  <button
                    class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700 @5xl:hidden"
                    title="Inspection, history, archive and more"
                    @click="manageProduct = product"
                  >
                    More
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filteredProducts.length === 0">
              <td colspan="5" class="cell-main p-6 text-center text-zinc-500">
                {{ loading ? 'Loading products...' : 'No products found.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePager
        v-if="filteredProducts.length > 0"
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filteredProducts.length"
        noun="products"
      />
    </div>

    <StockHistoryModal
      v-if="showHistory"
      :product="historyProduct"
      @close="showHistory = false"
    />

    <ActionSheet
      v-if="manageProduct"
      :title="manageProduct.nickname || manageProduct.name"
      :subtitle="`Stock: ${count(manageProduct.quantity)} · ${peso(manageProduct.price)}`"
      :actions="manageActions"
      @select="onManageAction"
      @close="manageProduct = null"
    />

    <!-- PRODUCT DETAILS MODAL -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="selectedProduct = null"
    >
      <div
        class="max-h-[92vh] overflow-y-auto relative w-full max-w-[520px] card p-6 shadow-2xl"
      >
        <button
          class="absolute right-5 top-5 rounded-full bg-black px-4 py-2 text-xl text-white hover:bg-red-600"
          @click="selectedProduct = null"
        >
          ×
        </button>

        <div class="flex flex-col items-center text-center">
          <img
            :src="selectedProduct.image_url || 'https://via.placeholder.com/600x400'"
            class="mb-5 h-[260px] w-full cursor-zoom-in rounded-3xl object-cover shadow-lg"
            @click="previewImage = selectedProduct.image_url || 'https://via.placeholder.com/600x400'"
          />

          <h2
            v-if="selectedProduct.nickname"
            class="text-3xl font-extrabold text-white"
          >
            {{ selectedProduct.nickname }}
          </h2>

          <h2
            :class="selectedProduct.nickname
              ? 'mt-1 text-lg font-semibold text-zinc-300'
              : 'text-3xl font-extrabold text-white'"
          >
            {{ selectedProduct.name }}
          </h2>

          <p class="mt-3 text-zinc-300">
            <b>Category:</b> {{ selectedProduct.category || 'Uncategorized' }}
          </p>

          <p class="mt-2 text-zinc-300">
            <b>Quantity:</b> {{ count(selectedProduct.quantity) }}
          </p>

          <p class="mt-2 text-red-400">
            <b>Price:</b> {{ peso(selectedProduct.price || 0) }}
          </p>

          <div class="mt-6 w-full text-left">
            <label class="label">Inspection Date</label>

            <input
              v-model="inspectionDate"
              type="date"
              class="w-full rounded-2xl border border-white/10 bg-zinc-800 px-4 py-4 text-lg text-white outline-none"
            />
          </div>

          <p
            v-if="detailMessage"
            class="mt-4 w-full rounded-xl p-3 text-left text-sm"
            :class="detailMessage.type === 'error' ? 'bg-red-600/20 text-red-400' : 'bg-emerald-600/15 text-emerald-300'"
            :role="detailMessage.type === 'error' ? 'alert' : 'status'"
          >
            {{ detailMessage.text }}
          </p>

          <div class="mt-5 flex w-full gap-3">
            <button
              class="flex-1 rounded-2xl bg-red-600 py-4 text-lg font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              :disabled="detailBusy"
              @click="setInspectionDate"
            >
              Set Inspection Date
            </button>

            <button
              class="flex-1 rounded-2xl bg-zinc-800 py-4 text-lg font-bold text-white transition hover:bg-zinc-700 disabled:opacity-50"
              :disabled="detailBusy"
              @click="reportProduct"
            >
              Report Product
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- FULL IMAGE PREVIEW -->
    <div
      v-if="previewImage"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4"
      @click.self="previewImage = null"
    >
      <button
        class="absolute right-6 top-6 rounded-full bg-zinc-900 px-4 py-2 text-2xl text-white hover:bg-red-600"
        @click="previewImage = null"
      >
        ×
      </button>

      <img
        :src="previewImage"
        class="max-h-[92vh] max-w-[96vw] rounded-3xl object-contain shadow-2xl"
      />
    </div>

    <!-- ARCHIVE CONFIRM MODAL -->
    <div
      v-if="actionModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeActionModal"
    >
      <div class="max-h-[92vh] overflow-y-auto w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="mb-3 text-xl font-bold text-white">Archive Product</h2>

        <p class="mb-2 text-sm text-zinc-300">
          <b>Product:</b> {{ archiveProduct?.name }}
        </p>

        <p class="mb-4 text-sm text-zinc-300">
          Are you sure you want to move this item to <b>Archived</b>?
        </p>

        <p
          v-if="modalError"
          class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400"
        >
          {{ modalError }}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="archiveSaving"
            @click="confirmArchive"
          >
            {{ archiveSaving ? 'Archiving...' : 'Proceed' }}
          </button>

          <button
            class="w-full rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            :disabled="archiveSaving"
            @click="closeActionModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- ADD PRODUCT MODAL -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="closeAddModal"
    >
      <div class="max-h-[92vh] overflow-y-auto w-full max-w-4xl rounded-[28px] border border-white/10 bg-[#18181b] p-6 shadow-2xl">
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-extrabold text-white">Add Product</h2>
            <p class="text-sm text-zinc-400">Create a new inventory item.</p>
          </div>

          <button
            class="rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            @click="closeAddModal"
          >
            ✕
          </button>
        </div>

        <div class="grid gap-6 md:grid-cols-[1fr_360px]">
          <div class="space-y-4 rounded-3xl bg-black/40 p-5">
            <h3 class="text-lg font-bold text-white">Product Details</h3>

            <div>
              <label class="label">Product Name</label>
              <input
                v-model="newProduct.name"
                type="text"
                placeholder="e.g. Vinyl Electrical Tape"
                class="input"
              />
            </div>

            <div>
              <label class="label">Category</label>
              <input
                v-model="newProduct.category"
                type="text"
                placeholder="e.g. Electrical Tape"
                class="input"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Quantity</label>
                <input
                  v-model.number="newProduct.quantity"
                  type="number"
                  min="0"
                  placeholder="Enter quantity"
                  class="input"
                />
              </div>

              <div>
                <label class="label">Price</label>
                <input
                  v-model.number="newProduct.price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter price"
                  class="input"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4 rounded-3xl bg-black/40 p-5">
            <h3 class="text-lg font-bold text-white">Product Image</h3>

            <label class="flex h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-red-500/70 bg-red-500/10 text-center hover:bg-red-500/20">
              <span class="text-3xl">📷</span>
              <span class="mt-2 font-bold text-white">
                {{ uploading ? 'Uploading...' : 'Upload Image' }}
              </span>
              <span class="text-xs text-zinc-400">PNG, JPG, JPEG</span>

              <input
                type="file"
                accept="image/*"
                @change="handleImageUpload"
                class="hidden"
              />
            </label>

            <div class="text-center text-xs uppercase tracking-widest text-zinc-500">
              OR paste image URL
            </div>

            <input
              v-model="newProduct.image_url"
              type="text"
              placeholder="https://image-link..."
              class="input"
            />

            <div class="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
              <img
                v-if="newProduct.image_url"
                :src="newProduct.image_url"
                class="h-44 w-full object-cover"
              />

              <div
                v-else
                class="flex h-44 items-center justify-center text-sm text-zinc-500"
              >
                Image preview will appear here
              </div>
            </div>
          </div>
        </div>

        <p
          v-if="addError"
          class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400"
        >
          {{ addError }}
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
            :disabled="uploading || addSaving"
            @click="addProduct"
          >
            {{ addSaving ? 'Adding...' : 'Add Product' }}
          </button>
        </div>
      </div>
    </div>

    <!-- EDIT PRODUCT MODAL -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="closeEditModal"
    >
      <div class="max-h-[92vh] overflow-y-auto w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#18181b] p-6 shadow-2xl">
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-extrabold text-white">Edit Product</h2>
            <p class="text-sm text-zinc-400">Change the nickname, price, quantity and picture.</p>
          </div>

          <button
            class="rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            @click="closeEditModal"
          >
            ✕
          </button>
        </div>

        <div class="grid gap-6 md:grid-cols-[1fr_300px]">
          <div class="space-y-4 rounded-3xl bg-black/40 p-5">
            <div>
              <label class="label">Real product name</label>
              <p class="rounded-2xl border border-white/5 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
                {{ editForm.name }}
              </p>
            </div>

            <div>
              <label class="label">Nickname (shown above the real name)</label>
              <input
                v-model="editForm.nickname"
                type="text"
                maxlength="80"
                placeholder="e.g. Brass valve 3/4"
                class="input"
              />
              <p class="mt-1 text-xs text-zinc-500">Leave empty to remove the nickname.</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Price</label>
                <!-- plain text + decimal keypad: type="number" was rejecting typed input -->
                <input
                  v-model="editForm.price"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="e.g. 250.00"
                  class="input"
                />
              </div>

              <div>
                <label class="label">Quantity</label>
                <input
                  v-model.number="editForm.quantity"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Enter quantity"
                  class="input"
                />
              </div>
            </div>

            <p
              v-if="Number(editForm.quantity) !== Number(editForm.originalQuantity)"
              class="text-xs text-amber-400"
            >
              Quantity will change from {{ count(editForm.originalQuantity) }} to {{ editForm.quantity === '' ? '—' : count(editForm.quantity) }}.
            </p>

            <p class="text-xs text-zinc-500">
              Category is not changed here. Quantity here sets the exact stock count; use Add Stock to add new deliveries.
            </p>
          </div>

          <div class="space-y-3 rounded-3xl bg-black/40 p-5">
            <h3 class="text-lg font-bold text-white">Picture</h3>

            <div class="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
              <img
                v-if="editForm.image_url"
                :src="editForm.image_url"
                class="h-40 w-full object-cover"
              />
              <div v-else class="flex h-40 items-center justify-center text-sm text-zinc-500">
                No picture
              </div>
            </div>

            <label class="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-red-500/70 bg-red-500/10 py-3 text-sm font-bold text-white hover:bg-red-500/20">
              {{ editUploading ? 'Uploading...' : '📷 Upload new picture' }}
              <input
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleEditImageUpload"
              />
            </label>

            <input
              v-model="editForm.image_url"
              type="text"
              placeholder="or paste image URL"
              class="input"
            />
          </div>
        </div>

        <p
          v-if="editError"
          class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400"
        >
          {{ editError }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-2xl bg-zinc-800 px-8 py-3 font-bold text-white hover:bg-zinc-700"
            @click="closeEditModal"
          >
            Cancel
          </button>

          <button
            class="rounded-2xl bg-red-600 px-10 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="editUploading || editSaving"
            @click="saveEdit"
          >
            {{ editSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ADD STOCK MODAL -->
    <div
      v-if="showStockModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeStockModal"
    >
      <div class="max-h-[92vh] overflow-y-auto w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="mb-2 text-2xl font-bold text-white">Add Stock</h2>

        <p class="mb-1 text-sm text-zinc-400">Product</p>
        <p class="mb-4 font-bold text-white">{{ stockProduct?.name }}</p>

        <p class="mb-2 text-sm text-zinc-400">
          Current Quantity: {{ count(stockProduct?.quantity) }}
        </p>

        <input
          v-model.number="stockAmount"
          type="number"
          min="1"
          placeholder="Enter quantity to add"
          class="input"
        />

        <p
          v-if="stockError"
          class="mt-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400"
        >
          {{ stockError }}
        </p>

        <div class="mt-5 flex gap-3">
          <button
            class="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="stockSaving"
            @click="addStock"
          >
            {{ stockSaving ? 'Saving...' : 'Confirm' }}
          </button>

          <button
            class="flex-1 rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
            @click="closeStockModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import PageHeader from '../../components/PageHeader.vue'
import StockHistoryModal from '../../components/StockHistoryModal.vue'
import ActionSheet from '../../components/ActionSheet.vue'
import TablePager from '../../components/TablePager.vue'
import { supabase } from '../../lib/supabase'
import { usePagination } from '../../lib/usePagination'
import { uploadImage } from '../../lib/uploadImage'
import { count, peso } from '../../lib/format'

const products = ref([])
const selectedCategory = ref('All')
const selectedProduct = ref(null)
// the product its Archive button was pressed for (asked to confirm first)
const archiveProduct = ref(null)
const previewImage = ref(null)
const inspectionDate = ref('')
// result of "Set Inspection Date" / "Report Product", shown inside the
// product window (these used to be the browser's plain alert boxes)
const detailMessage = ref(null) // { type: 'error' | 'success', text }
const detailBusy = ref(false)

const loading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')

const actionModal = ref(false)
const modalError = ref('')

const showAddModal = ref(false)
const showStockModal = ref(false)

const addError = ref('')
const stockError = ref('')

const stockProduct = ref(null)
const stockAmount = ref(0)

const uploading = ref(false)

// true while saving: the button is disabled, so a double click can't save
// twice (Add Stock used to add the stock twice, Add Product made two products)
const stockSaving = ref(false)
const addSaving = ref(false)
const archiveSaving = ref(false)

const newProduct = ref({
  name: '',
  category: '',
  quantity: '',
  price: '',
  image_url: '',
})

const categories = computed(() => {
  const uniqueCategories = products.value
    .map(product => product.category || 'Uncategorized')
    .filter(Boolean)

  return ['All', ...new Set(uniqueCategories)]
})

const filteredProducts = computed(() => {
  let result = products.value

  if (selectedCategory.value !== 'All') {
    result = result.filter(
      product => (product.category || 'Uncategorized') === selectedCategory.value
    )
  }

  if (searchQuery.value.trim()) {
    // trim: phone keyboards add a space after a word, which matched nothing
    const search = searchQuery.value.trim().toLowerCase()

    result = result.filter(product => {
      const name = product.name || ''
      const nickname = product.nickname || ''
      const category = product.category || 'Uncategorized'

      return (
        name.toLowerCase().includes(search) ||
        nickname.toLowerCase().includes(search) ||
        category.toLowerCase().includes(search)
      )
    })
  }

  return result
})

// The table shows 10, 15 or all products a page, with page buttons under it.
const tableTop = ref(null)

const {
  page,
  pageSize,
  visible: visibleProducts,
  reset: resetList,
} = usePagination(filteredProducts, { storageKey: 'inventory', scrollTarget: tableTop })

// a new search or category starts again at page 1
watch([searchQuery, selectedCategory], resetList)

// ----- The "More" menu of a product -----
// Phones and narrower tables don't have room for every button in a row,
// so they show "More" with all the actions (including Archive) instead.
const manageProduct = ref(null)

const manageActions = [
  { key: 'edit', label: '✎ Edit product', hint: 'Nickname, price, quantity and picture' },
  { key: 'inspection', label: '📅 Inspection date / report' },
  { key: 'history', label: 'Stock history' },
  { key: 'archive', label: 'Move to Archived', tone: 'danger' },
]

function onManageAction(key) {
  const product = manageProduct.value
  manageProduct.value = null
  if (!product) return

  if (key === 'edit') openEditModal(product)
  else if (key === 'inspection') openModal(product)
  else if (key === 'history') openHistory(product)
  else if (key === 'archive') openArchiveModal(product)
}

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'active',
    p_order_by: 'id_desc',
  })

  if (error) {
    errorMessage.value = error.message
    products.value = []
  } else {
    // Nicknames come from their own small function so list_products stays untouched.
    // If it isn't set up yet (SQL not run), products simply show without nicknames.
    const nicknames = {}
    const { data: nickRows } = await supabase.rpc('list_product_nicknames')
    ;(nickRows || []).forEach(row => {
      nicknames[String(row.id)] = row.nickname
    })

    products.value = (data || []).map(product => ({
      ...product,
      nickname: nicknames[String(product.id)] || '',
    }))
  }

  loading.value = false
}

function openModal(product) {
  selectedProduct.value = product
  inspectionDate.value = product.inspection_date || ''
  detailMessage.value = null
}

// Archive button of a row (or "Move to Archived" in the phone menu):
// asks to confirm first
function openArchiveModal(product) {
  archiveProduct.value = product
  modalError.value = ''
  actionModal.value = true
}

function closeActionModal() {
  if (archiveSaving.value) return

  actionModal.value = false
  archiveProduct.value = null
  modalError.value = ''
}

async function confirmArchive() {
  if (!archiveProduct.value || archiveSaving.value) return

  archiveSaving.value = true

  const { error } = await supabase.rpc('confirm_archive', {
    p_product_id: archiveProduct.value.id,
  })

  archiveSaving.value = false

  if (error) {
    modalError.value = error.message
    return
  }

  actionModal.value = false
  archiveProduct.value = null

  await fetchProducts()
}

function openStockModal(product) {
  stockProduct.value = product
  stockAmount.value = 0
  stockError.value = ''
  showStockModal.value = true
}

function closeStockModal() {
  showStockModal.value = false
  stockProduct.value = null
  stockAmount.value = 0
  stockError.value = ''
}

async function addStock() {
  if (!stockProduct.value || stockSaving.value) return

  if (!stockAmount.value || Number(stockAmount.value) <= 0) {
    stockError.value = 'Please enter a valid quantity.'
    return
  }

  stockSaving.value = true

  const { error } = await supabase.rpc('add_stock', {
    p_product_id: stockProduct.value.id,
    p_amount: Number(stockAmount.value),
  })

  stockSaving.value = false

  if (error) {
    stockError.value = error.message
    return
  }

  closeStockModal()
  await fetchProducts()
}

function closeAddModal() {
  showAddModal.value = false
  addError.value = ''
}

async function addProduct() {
  if (addSaving.value) return

  addError.value = ''

  if (!newProduct.value.name.trim()) {
    addError.value = 'Product name is required.'
    return
  }

  addSaving.value = true

  const { error } = await supabase.rpc('add_product', {
    p_name: newProduct.value.name.trim(),
    p_category: newProduct.value.category.trim(),
    p_quantity: Number(newProduct.value.quantity || 0),
    p_price: Number(newProduct.value.price || 0),
    p_image_url: newProduct.value.image_url.trim(),
  })

  addSaving.value = false

  if (error) {
    addError.value = error.message
    return
  }

  newProduct.value = {
    name: '',
    category: '',
    quantity: '',
    price: '',
    image_url: '',
  }

  showAddModal.value = false

  await fetchProducts()
}

async function handleImageUpload(event) {
  const file = event.target.files[0]

  if (!file) return

  uploading.value = true
  addError.value = ''

  try {
    newProduct.value.image_url = await uploadImage(file, { bucket: 'products' })
  } catch (err) {
    addError.value = err.message
    event.target.value = ''
  }

  uploading.value = false
}

// ----- Stock history -----
const showHistory = ref(false)
const historyProduct = ref(null) // null = all products

function openHistory(product) {
  historyProduct.value = product
  showHistory.value = true
}

// ----- Edit product (nickname, price, quantity, picture) -----
const showEditModal = ref(false)
const editForm = ref({
  id: null,
  name: '',
  nickname: '',
  price: '',
  quantity: '',
  originalQuantity: 0,
  image_url: '',
})
const editError = ref('')
const editSaving = ref(false)
const editUploading = ref(false)

function openEditModal(product) {
  editForm.value = {
    id: product.id,
    name: product.name || '',
    nickname: product.nickname || '',
    price: Number(product.price || 0),
    quantity: Number(product.quantity || 0),
    originalQuantity: Number(product.quantity || 0),
    image_url: product.image_url || '',
  }
  editError.value = ''
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editError.value = ''
}

async function handleEditImageUpload(event) {
  const file = event.target.files[0]

  if (!file) return

  editUploading.value = true
  editError.value = ''

  try {
    editForm.value.image_url = await uploadImage(file, { bucket: 'products' })
  } catch (err) {
    editError.value = err.message
  }

  event.target.value = ''
  editUploading.value = false
}

async function saveEdit() {
  editError.value = ''

  const nickname = String(editForm.value.nickname || '').trim()
  // accept "1,250.50" as well as "1250.50"
  const priceText = String(editForm.value.price ?? '').replace(/,/g, '').trim()
  const price = Number(priceText)
  const quantity = Number(editForm.value.quantity)

  if (priceText === '' || !Number.isFinite(price) || price < 0) {
    editError.value = 'Enter a valid price (0 or more).'
    return
  }

  if (editForm.value.quantity === '' || !Number.isInteger(quantity) || quantity < 0) {
    editError.value = 'Enter a valid quantity (a whole number, 0 or more).'
    return
  }

  editSaving.value = true

  const { error } = await supabase.rpc('update_product', {
    p_product_id: String(editForm.value.id),
    p_nickname: nickname,
    p_price: price,
    p_image_url: String(editForm.value.image_url || '').trim(),
  })

  if (error) {
    editSaving.value = false
    editError.value = error.message
    return
  }

  // Only touch the quantity if it was actually changed
  if (quantity !== Number(editForm.value.originalQuantity)) {
    const { error: qtyError } = await supabase.rpc('set_product_quantity', {
      p_product_id: Number(editForm.value.id),
      p_quantity: quantity,
    })

    if (qtyError) {
      editSaving.value = false
      editError.value = `Other changes were saved, but quantity was not: ${qtyError.message}`
      await fetchProducts()
      return
    }
  }

  editSaving.value = false
  showEditModal.value = false
  await fetchProducts()
}

async function setInspectionDate() {
  if (!selectedProduct.value || detailBusy.value) return

  if (!inspectionDate.value) {
    detailMessage.value = { type: 'error', text: 'Choose a date first.' }
    return
  }

  detailBusy.value = true
  detailMessage.value = null

  const { error } = await supabase.rpc('set_inspection_date', {
    p_product_id: selectedProduct.value.id,
    p_date: inspectionDate.value,
  })

  detailBusy.value = false

  if (error) {
    detailMessage.value = { type: 'error', text: error.message }
    return
  }

  selectedProduct.value = null

  await fetchProducts()
}

async function reportProduct() {
  if (!selectedProduct.value || detailBusy.value) return

  detailBusy.value = true
  detailMessage.value = null

  const { error } = await supabase.rpc('report_product_for_checking', {
    p_product_id: selectedProduct.value.id,
  })

  detailBusy.value = false

  // it used to say "sent" even when it failed
  if (error) {
    detailMessage.value = { type: 'error', text: error.message }
    return
  }

  detailMessage.value = { type: 'success', text: 'Product report sent.' }
}

onMounted(fetchProducts)
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
</style>