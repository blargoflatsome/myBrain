<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-28">
    <template v-if="!bucket">
      <div>
        <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
        <p class="text-muted italic">{{ m.intro }}</p>
      </div>
      <p v-if="!buckets.length" class="text-muted">{{ m.noBuckets }}</p>
      <p v-if="buckets.length > 1" class="-mt-3 text-xs text-muted">{{ m.dragHint }}</p>
      <ul ref="list" class="flex flex-col gap-2" :aria-label="m.bucketsHeading">
        <li v-for="(b, bi) in buckets" :key="b.id" class="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-surface pl-1" data-testid="vault-bucket">
          <button
            type="button"
            class="drag-handle flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl text-muted active:cursor-grabbing"
            :aria-label="m.drag(b.name)"
            :data-handle="b.id"
            :aria-expanded="movingId === b.id"
            @keydown="moveByKey($event, b)"
            @blur="onHandleBlur"
            @click="movingId = movingId === b.id ? null : b.id"
          >
            <span aria-hidden="true">⠿</span>
          </button>
          <button type="button" class="flex min-h-14 flex-1 items-center justify-between gap-3 pr-4 pl-1 text-left" @click="openBucket(b)">
            <span class="font-medium"><span v-if="b.starred" class="text-star" aria-hidden="true">★ </span>{{ b.name }}</span>
            <span class="text-sm text-muted">{{ m.itemCount(countIn(b)) }}</span>
          </button>
          <div v-if="movingId === b.id" class="flex w-full gap-2 px-2 pb-2" role="group" :aria-label="m.moveGroup(b.name)">
            <button type="button" class="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm" :disabled="bi === 0" :data-move="b.id" :data-step="-1" @click="moveByButton(b.id, -1)">↑ {{ messages.moveUp }}</button>
            <button type="button" class="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm" :disabled="bi === buckets.length - 1" :data-move="b.id" :data-step="1" @click="moveByButton(b.id, 1)">↓ {{ messages.moveDown }}</button>
          </div>
        </li>
      </ul>
      <form v-if="addingBucket" class="flex gap-2" @submit.prevent="createBucket">
        <input v-model="newBucketName" maxlength="200" :class="fieldOnPage" :aria-label="m.newBucketName" :placeholder="m.newBucketName">
        <button type="submit" class="min-h-12 shrink-0 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.createBucket }}</button>
      </form>
      <button v-else type="button" class="min-h-12 self-start rounded-xl border border-line bg-surface px-4 font-medium" @click="addingBucket = true">
        {{ m.newBucket }}
      </button>
    </template>

    <template v-else>
      <div class="flex flex-col gap-2">
        <button type="button" class="self-start text-sm text-muted underline" @click="router.push({ query: {} })">← {{ m.back }}</button>
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-bold">{{ bucket.name }}</h1>
          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              class="flex size-11 items-center justify-center rounded-xl border text-xl"
              :class="bucket.starred ? 'border-accent text-star' : 'border-line text-muted'"
              :aria-pressed="!!bucket.starred"
              :aria-label="bucket.starred ? m.unstar(bucket.name) : m.star(bucket.name)"
              :title="m.starHint"
              @click="brain.saveBucket({ ...bucket, starred: !bucket.starred })"
            >
              {{ bucket.starred ? '★' : '☆' }}
            </button>
            <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="editingBucket = bucket">{{ m.settings }}</button>
          </div>
        </div>
      </div>

      <form class="flex gap-2" @submit.prevent="addItem">
        <input v-model="newItem" maxlength="500" :class="fieldOnPage" :aria-label="m.addLabel(bucket.name)" :placeholder="m.addPlaceholder">
        <button type="submit" class="min-h-12 shrink-0 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.add }}</button>
      </form>

      <p v-if="!bucketItems.length" class="text-muted">{{ m.empty }}</p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="i in bucketItems"
          :key="i.id"
          class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3"
          :class="i.checked ? 'opacity-60' : ''"
          data-testid="vault-item"
        >
          <button
            v-if="bucket.checkable"
            type="button"
            role="checkbox"
            class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm"
            :class="i.checked ? 'border-accent bg-accent text-accent-ink' : 'border-control'"
            :aria-checked="!!i.checked"
            :aria-label="i.checked ? m.uncheck(i.title) : m.check(i.title)"
            @click="brain.toggleVaultItem(i.id)"
          >
            <span v-if="i.checked" aria-hidden="true">✓</span>
          </button>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <button type="button" class="text-left font-medium" :class="i.checked ? 'line-through' : ''" :aria-label="m.open(i.title)" @click="editing = i">
              {{ i.title }}
            </button>
            <span v-if="i.rating" class="text-sm text-star" :aria-label="m.stars(i.rating)" role="img">{{ '★'.repeat(i.rating) }}<span class="text-muted">{{ '☆'.repeat(5 - i.rating) }}</span></span>
            <p v-if="i.notes" class="line-clamp-2 text-sm whitespace-pre-wrap text-muted">{{ i.notes }}</p>
            <a
              v-if="i.link"
              :href="linkTarget(i.link).href"
              target="_blank"
              rel="noopener noreferrer"
              class="self-start text-sm text-accent underline"
              :aria-label="`${linkTarget(i.link).kind === 'map' ? m.openMap : m.openLink}: ${linkLabel(i.link)}`"
            >{{ linkTarget(i.link).kind === 'map' ? '📍' : '🔗' }} {{ linkLabel(i.link) }}</a>
          </div>
          <button
            type="button"
            class="-my-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-danger"
            :aria-label="m.deleteItem(i.title)"
            @click="askDelete(i)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
          </button>
        </li>
      </ul>
      <button v-if="checked.length" type="button" class="min-h-11 self-start rounded-xl border border-line px-4 text-sm" @click="confirmClear?.open()">
        {{ m.clearChecked }}
      </button>
    </template>

    <VaultItemEditor :item="editing" :buckets="buckets" @save="saveItem" @delete="deleteItem" @close="closeEditor" />
    <BucketEditor
      :bucket="editingBucket"
      :item-count="editingBucket ? countIn(editingBucket) : 0"
      @save="saveBucket"
      @delete="deleteBucket"
      @close="editingBucket = null"
    />

    <ConfirmDialog
      ref="confirmDelete"
      :heading="m.confirmDeleteItem.heading"
      :body="m.confirmDeleteItem.body(deleting?.title ?? '', bucket?.name ?? '')"
      :confirm-label="m.confirmDeleteItem.confirm"
      :keep-label="m.confirmDeleteItem.keep"
      @close="deleting = null"
      @confirm="confirmDeleteItem"
    />

    <ConfirmDialog
      ref="confirmClear"
      :heading="m.confirmClear.heading"
      :body="m.confirmClear.body(checked.length, bucket?.name ?? '')"
      :confirm-label="m.confirmClear.confirm"
      :keep-label="m.confirmClear.keep"
      @confirm="clearChecked"
    />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 The Vault: my buckets; inside one, its items with a quick add box, check-off, ratings and links.
import { computed, ref, watch } from 'vue'
import { arrowStep, useDragSort } from '@/composables/useDragSort'
import { useRoute, useRouter } from 'vue-router'
import VaultItemEditor from '@/components/VaultItemEditor.vue'
import BucketEditor from '@/components/BucketEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { activeBuckets, checkedItems, itemsInBucket, linkLabel, linkTarget } from '@/vault/rules'
import { messages } from '@/messages'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { fieldOnPage } from '@/ui/styles'
import { live } from '@/sync/live'

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
const m = messages.vault

const buckets = useLiveQuery<VaultBucketRow[]>(async () => (brain.db ? activeBuckets(await brain.db.vault_buckets.toArray()) : []), [], [() => brain.db])
const items = useLiveQuery<VaultItemRow[]>(async () => (brain.db ? live(await brain.db.vault_items.toArray()) : []), [], [() => brain.db])

const bucketId = computed(() => (typeof route.query.bucket === 'string' ? route.query.bucket : null))
const bucket = computed(() => buckets.value.find((b) => b.id === bucketId.value) ?? null)
const bucketItems = computed(() => (bucket.value ? itemsInBucket(items.value, bucket.value) : []))
const checked = computed(() => (bucket.value ? checkedItems(items.value, bucket.value) : []))
const countIn = (b: VaultBucketRow) => items.value.filter((i) => i.bucket_id === b.id).length

function openBucket(b: VaultBucketRow) {
  void router.push({ query: { bucket: b.id } })
}

// ---------- Buckets ----------
const addingBucket = ref(false)
const newBucketName = ref('')
async function createBucket() {
  const name = newBucketName.value.trim()
  if (!name) return
  await brain.createBucket(name)
  newBucketName.value = ''
  addingBucket.value = false
}
/** Move a bucket from one place in the list to another and save the new order. */
async function reorder(from: number, to: number) {
  const order = buckets.value.map((x) => x.id)
  if (from === to || from < 0 || to < 0 || to >= order.length) return
  const [id] = order.splice(from, 1)
  order.splice(to, 0, id!)
  for (const [position, bid] of order.entries()) {
    const row = buckets.value.find((x) => x.id === bid)!
    if (row.position !== position) await brain.saveBucket({ ...row, position })
  }
}

// Drag and drop by the handle (mouse or touch). The arrow keys on the handle move a bucket too.
const list = ref<HTMLUListElement | null>(null)
useDragSort(list, reorder)

// Key presses queue up, so quick presses each move the bucket one place, in order.
let keyMoves: Promise<void> = Promise.resolve()
/** The bucket being moved with the keyboard: its handle keeps focus while the list redraws. */
const keyboardId = ref<string | null>(null)
function moveByKey(event: KeyboardEvent, b: VaultBucketRow) {
  const step = arrowStep(event)
  if (!step) return
  event.preventDefault()
  keyboardId.value = b.id
  keyMoves = keyMoves.then(() => moveOne(b.id, step)).catch(() => {})
}
async function moveOne(id: string, step: number) {
  const from = buckets.value.findIndex((x) => x.id === id)
  const to = from + step
  if (from < 0 || to < 0 || to >= buckets.value.length) return
  await reorder(from, to)
  // Let the list catch up before the next queued move reads the order.
  for (let i = 0; i < 50 && buckets.value.findIndex((x) => x.id === id) !== to; i++) await new Promise((r) => setTimeout(r, 20))
}
// Right after each redraw, put focus back on the handle being moved (moving an element can drop its focus).
watch(
  buckets,
  () => {
    const el = keyboardId.value ? list.value?.querySelector<HTMLButtonElement>(`[data-handle="${keyboardId.value}"]`) : null
    if (el && document.activeElement !== el) el.focus()
  },
  { flush: 'post' },
)
// Tapping a handle shows Move up / Move down, so buckets can be sorted without dragging (WCAG 2.5.7).
const movingId = ref<string | null>(null)
async function moveByButton(id: string, step: -1 | 1) {
  await moveOne(id, step)
  const at = buckets.value.findIndex((x) => x.id === id)
  const target = (at + step < 0 || at + step >= buckets.value.length) ? -step : step
  list.value?.querySelector<HTMLButtonElement>(`[data-move="${id}"][data-step="${target}"]`)?.focus()
}
function onHandleBlur(event: FocusEvent) {
  // Focus moved somewhere else on purpose (not lost to a redraw): stop following.
  if (event.relatedTarget) keyboardId.value = null
}

const editingBucket = ref<VaultBucketRow | null>(null)
async function saveBucket(b: VaultBucketRow) {
  await brain.saveBucket(b)
  editingBucket.value = null
}
async function deleteBucket(b: VaultBucketRow) {
  await brain.deleteBucket(b.id)
  editingBucket.value = null
  await router.push({ query: {} })
}

// ---------- Items ----------
const newItem = ref('')
async function addItem() {
  const title = newItem.value
  if (!bucket.value || !title.trim()) return
  // Clear first, so the next item can be typed straight away without being lost.
  newItem.value = ''
  await brain.addVaultItem(bucket.value.id, title)
}
const editing = ref<VaultItemRow | null>(null)
watch(
  [() => route.query.item, items],
  ([id]) => {
    if (typeof id === 'string' && !editing.value) editing.value = items.value.find((i) => i.id === id) ?? null
  },
  { immediate: true },
)
async function closeEditor() {
  editing.value = null
  if (route.query.item) await router.replace({ query: { bucket: bucketId.value ?? undefined } })
}
async function saveItem(i: VaultItemRow) {
  await brain.saveVaultItem(i)
  await closeEditor()
}
async function deleteItem(i: VaultItemRow) {
  await brain.deleteVaultItem(i.id)
  await closeEditor()
}

// Delete straight from the list, after confirming (SPEC §5 The Vault).
const confirmDelete = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const deleting = ref<VaultItemRow | null>(null)
function askDelete(i: VaultItemRow) {
  deleting.value = i
  confirmDelete.value?.open()
}
async function confirmDeleteItem() {
  if (deleting.value) await brain.deleteVaultItem(deleting.value.id)
  confirmDelete.value?.close()
}

const confirmClear = ref<InstanceType<typeof ConfirmDialog> | null>(null)
async function clearChecked() {
  if (bucket.value) await brain.clearChecked(bucket.value.id)
  confirmClear.value?.close()
}

</script>
