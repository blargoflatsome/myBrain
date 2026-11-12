<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <template v-if="!bucket">
      <PageHeading :heading="m.heading" :intro="m.intro">
        <NewButton :label="m.newBucket" data-testid="new-bucket" @click="addingBucket = true" />
      </PageHeading>
      <p v-if="!buckets.length" class="text-muted">{{ m.noBuckets }}</p>
      <ul class="flex flex-col gap-2" :aria-label="m.bucketsHeading">
        <li v-for="b in buckets" :key="b.id" class="flex items-center rounded-2xl border border-line bg-surface" data-testid="vault-bucket">
          <button type="button" class="flex min-h-14 flex-1 items-center justify-between gap-3 px-4 text-left" @click="openBucket(b)">
            <span class="font-medium"><AppIcon v-if="b.starred" name="star" filled class="mr-1 text-star" />{{ b.name }}</span>
            <span class="text-sm text-muted">{{ m.itemCount(countIn(b)) }}</span>
          </button>
        </li>
      </ul>
      <form v-if="addingBucket" class="flex gap-2" @submit.prevent="createBucket">
        <input v-model="newBucketName" maxlength="200" autofocus :class="fieldOnPage" :aria-label="m.newBucketName" :placeholder="m.newBucketName">
        <button type="submit" class="shrink-0" :class="primaryButton">{{ m.createBucket }}</button>
      </form>
    </template>

    <template v-else>
      <div class="flex flex-col gap-2">
        <button type="button" class="self-start text-sm text-muted underline" @click="router.push({ query: {} })">← {{ m.back }}</button>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="min-w-0 text-2xl font-bold break-words">{{ bucket.name }}</h1>
          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              class="flex size-11 items-center justify-center rounded-xl border text-xl"
              :class="bucket.starred ? 'border-accent text-star' : 'border-line text-muted'"
              :aria-pressed="!!bucket.starred"
              :aria-label="bucket.starred ? m.unstar(bucket.name) : m.star(bucket.name)"
              :title="m.starHint"
              @click="brain.save('vault_buckets', { ...bucket, starred: !bucket.starred })"
            >
              <AppIcon name="star" :filled="bucket.starred" size="size-5" />
            </button>
            <button type="button" :class="smallButton" @click="editingBucket = bucket">{{ m.settings }}</button>
          </div>
        </div>
      </div>

      <form class="flex gap-2" @submit.prevent="addItem">
        <input v-model="newItem" maxlength="500" :class="fieldOnPage" :aria-label="m.addLabel(bucket.name)" :placeholder="m.addPlaceholder">
        <button type="submit" class="shrink-0" :class="primaryButton">{{ m.add }}</button>
      </form>

      <p v-if="!bucketItems.length" class="text-muted">{{ m.empty }}</p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="i in bucketItems"
          :key="i.id"
          class="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3"
          :class="i.checked ? 'text-muted' : ''"
          data-testid="vault-item"
        >
          <CheckCircle
            v-if="bucket.checkable"
            role="checkbox"
            :on="!!i.checked"
            :label="i.checked ? m.uncheck(i.title) : m.check(i.title)"
            @click="brain.toggleVaultItem(i.id)"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <button type="button" class="text-left font-medium" :class="i.checked ? 'line-through' : ''" :aria-label="m.open(i.title)" @click="editing = i">
              {{ i.title }}
            </button>
            <span v-if="i.rating" class="text-sm text-star" :aria-label="m.stars(i.rating)" role="img"><AppIcon v-for="n in 5" :key="n" name="star" :filled="n <= i.rating" :class="n <= i.rating ? '' : 'text-muted'" /></span>
            <p v-if="i.notes" class="line-clamp-2 text-sm text-muted">{{ plainText(i.notes) }}</p>
            <a
              v-if="i.link"
              :href="linkTarget(i.link).href"
              target="_blank"
              rel="noopener noreferrer"
              class="self-start text-sm text-accent underline"
              :aria-label="`${linkTarget(i.link).kind === 'map' ? m.openMap : m.openLink}: ${linkLabel(i.link)}`"
            ><AppIcon :name="linkTarget(i.link).kind === 'map' ? 'pin' : 'link'" class="mr-1" />{{ linkLabel(i.link) }}</a>
          </div>
          <RowDelete class="-my-1 -mr-1" :label="m.deleteItem(i.title)" @click="askDelete(i)" />
        </li>
      </ul>
      <button v-if="checked.length" type="button" :class="[smallButton, 'self-start']" @click="clearChecked">
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
  </main>
</template>

<script setup lang="ts">
// SPEC §5 The Vault: my buckets; inside one, its items with a quick add box, check-off, ratings and links.
import AppIcon from '@/components/AppIcon.vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import VaultItemEditor from '@/vault/components/VaultItemEditor.vue'
import BucketEditor from '@/vault/components/BucketEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { activeBuckets, checkedItems, itemsInBucket, linkLabel, linkTarget } from '@/vault/rules'
import { messages } from '@/messages'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import { fieldOnPage, primaryButton, smallButton } from '@/ui/styles'
import PageHeading from '@/components/PageHeading.vue'
import NewButton from '@/components/NewButton.vue'
import RowDelete from '@/components/RowDelete.vue'
import CheckCircle from '@/components/CheckCircle.vue'
import { live } from '@/sync/live'
import { useUndoStore } from '@/stores/undo'
import { plainText } from '@/journal/body'

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
const editingBucket = ref<VaultBucketRow | null>(null)
async function saveBucket(b: VaultBucketRow) {
  await brain.save('vault_buckets', b)
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
// One item, or the checked ones, go straight away with Undo (SPEC §2).
const undo = useUndoStore()
async function deleteItem(i: VaultItemRow) {
  await brain.remove('vault_items', i.id)
  await closeEditor()
  undo.offer(messages.undo.deleted(i.title), () => brain.restore('vault_items', i.id))
}
async function askDelete(i: VaultItemRow) {
  await brain.remove('vault_items', i.id)
  undo.offer(messages.undo.deleted(i.title), () => brain.restore('vault_items', i.id))
}
async function clearChecked() {
  if (!bucket.value) return
  const ids = await brain.clearChecked(bucket.value.id)
  undo.offer(messages.undo.clearedChecked(ids.length), async () => {
    for (const id of ids) await brain.restore('vault_items', id)
  })
}

</script>
