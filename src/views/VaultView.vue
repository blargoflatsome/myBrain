<script setup lang="ts">
// SPEC §5 The Vault: my buckets; inside one, its items with a quick add box, check-off, ratings and links.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import { useRoute, useRouter } from 'vue-router'
import VaultItemEditor from '@/components/VaultItemEditor.vue'
import BucketEditor from '@/components/BucketEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { activeBuckets, checkedItems, itemsInBucket, linkLabel, linkTarget } from '@/vault/rules'
import { messages } from '@/messages'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
const m = messages.vault

const buckets = useLiveQuery<VaultBucketRow[]>(async () => (brain.db ? activeBuckets(await brain.db.vault_buckets.toArray()) : []), [], [() => brain.db])
const items = useLiveQuery<VaultItemRow[]>(async () => (brain.db ? (await brain.db.vault_items.toArray()).filter((i) => !i.deleted_at) : []), [], [() => brain.db])

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
let sortable: Sortable | null = null
watch(
  list,
  (el) => {
    sortable?.destroy()
    sortable = null
    if (!el) return
    sortable = Sortable.create(el, {
      handle: '.drag-handle',
      animation: 150,
      forceFallback: true,
      fallbackTolerance: 3,
      ghostClass: 'opacity-40',
      onEnd: (evt) => {
        const { oldIndex, newIndex, item, from } = evt
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        // Put the element back where Vue rendered it; the new order is saved and Vue redraws the list.
        from.removeChild(item)
        from.insertBefore(item, from.children[oldIndex] ?? null)
        void reorder(oldIndex, newIndex)
      },
    })
  },
  { flush: 'post' },
)
onBeforeUnmount(() => sortable?.destroy())

async function moveByKey(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!step) return
  event.preventDefault()
  await reorder(index, index + step)
  await nextTick()
  list.value?.querySelectorAll<HTMLButtonElement>('.drag-handle')[index + step]?.focus()
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

const confirmClear = ref<HTMLDialogElement | null>(null)
async function clearChecked() {
  if (bucket.value) await brain.clearChecked(bucket.value.id)
  confirmClear.value?.close()
}

const field = 'min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink'
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-28">
    <!-- All buckets -->
    <template v-if="!bucket">
      <div>
        <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
        <p class="text-muted italic">{{ m.intro }}</p>
      </div>
      <p v-if="!buckets.length" class="text-muted">{{ m.noBuckets }}</p>
      <p v-if="buckets.length > 1" class="-mt-3 text-xs text-muted">{{ m.dragHint }}</p>
      <ul ref="list" class="flex flex-col gap-2" :aria-label="m.bucketsHeading">
        <li v-for="(b, i) in buckets" :key="b.id" class="flex items-center gap-1 rounded-2xl border border-line bg-surface pl-1" data-testid="vault-bucket">
          <button
            type="button"
            class="drag-handle flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl text-muted active:cursor-grabbing"
            :aria-label="m.drag(b.name)"
            @keydown="moveByKey($event, i)"
          >
            ⠿
          </button>
          <button type="button" class="flex min-h-14 flex-1 items-center justify-between gap-3 pr-4 pl-1 text-left" @click="openBucket(b)">
            <span class="font-medium">{{ b.name }}</span>
            <span class="text-sm text-muted">{{ m.itemCount(countIn(b)) }}</span>
          </button>
        </li>
      </ul>
      <form v-if="addingBucket" class="flex gap-2" @submit.prevent="createBucket">
        <input v-model="newBucketName" :class="field" :aria-label="m.newBucketName" :placeholder="m.newBucketName">
        <button type="submit" class="min-h-12 shrink-0 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.createBucket }}</button>
      </form>
      <button v-else type="button" class="min-h-12 self-start rounded-xl border border-line bg-surface px-4 font-medium" @click="addingBucket = true">
        {{ m.newBucket }}
      </button>
    </template>

    <!-- One bucket -->
    <template v-else>
      <div class="flex flex-col gap-2">
        <button type="button" class="self-start text-sm text-muted underline" @click="router.push({ query: {} })">← {{ m.back }}</button>
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-2xl font-bold">{{ bucket.name }}</h1>
          <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="editingBucket = bucket">{{ m.settings }}</button>
        </div>
      </div>

      <form class="flex gap-2" @submit.prevent="addItem">
        <input v-model="newItem" :class="field" :aria-label="m.addLabel(bucket.name)" :placeholder="m.addPlaceholder">
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
            :class="i.checked ? 'border-accent bg-accent text-accent-ink' : 'border-line'"
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
            <span v-if="i.rating" class="text-sm text-yellow-400" :aria-label="m.stars(i.rating)" role="img">{{ '★'.repeat(i.rating) }}<span class="text-line">{{ '★'.repeat(5 - i.rating) }}</span></span>
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
        </li>
      </ul>
      <button v-if="checked.length" type="button" class="min-h-11 self-start rounded-xl border border-line px-4 text-sm" @click="confirmClear?.showModal()">
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

    <dialog
      ref="confirmClear"
      class="m-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
      role="alertdialog"
      :aria-label="m.confirmClear.heading"
    >
      <h2 class="text-lg font-semibold">{{ m.confirmClear.heading }}</h2>
      <p class="mt-2 text-muted">{{ m.confirmClear.body(checked.length, bucket?.name ?? '') }}</p>
      <div class="mt-4 flex gap-2">
        <button type="button" class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-white" @click="clearChecked">{{ m.confirmClear.confirm }}</button>
        <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmClear?.close()">{{ m.confirmClear.keep }}</button>
      </div>
    </dialog>
  </main>
</template>
