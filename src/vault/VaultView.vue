<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <template v-if="!bucket">
      <PageHeading :heading="m.heading" :intro="m.intro" />
      <form class="flex gap-2" @submit.prevent="createBucket">
        <input v-model="newBucketName" maxlength="200" :class="fieldOnPage" :aria-label="m.newBucketName" :placeholder="m.newBucketName">
        <button type="submit" class="shrink-0" :class="primaryButton">{{ m.createBucket }}</button>
      </form>
      <p v-if="!buckets.length" class="text-muted">{{ m.noBuckets }}</p>
      <ul class="flex flex-col gap-2" :aria-label="m.bucketsHeading">
        <li v-for="b in buckets" :key="b.id" class="flex items-center rounded-2xl border border-line bg-surface" data-testid="vault-bucket">
          <button type="button" class="flex min-h-14 flex-1 items-center justify-between gap-3 px-4 text-left" @click="openBucket(b)">
            <span class="flex min-w-0 flex-col">
              <span class="font-medium [overflow-wrap:anywhere]"><AppIcon v-if="b.starred" name="star" filled class="mr-1 text-star" />{{ b.name }}</span>
              <span v-if="b.is_default" class="text-xs text-muted" data-testid="bucket-default">{{ m.defaultBucket }}</span>
              <span v-if="sharingLine(b)" class="text-xs text-muted" data-testid="bucket-sharing-line">{{ sharingLine(b) }}</span>
            </span>
            <span class="shrink-0 text-sm text-muted">{{ m.itemCount(countIn(b)) }}</span>
          </button>
        </li>
      </ul>
    </template>

    <template v-else>
      <div class="flex flex-col gap-2">
        <button type="button" class="self-start text-sm text-muted underline" @click="router.push({ query: {} })">← {{ m.back }}</button>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-2xl font-bold break-words">{{ bucket.name }}</h1>
            <p v-if="sharingLine(bucket)" class="text-sm text-muted" data-testid="bucket-sharing-line">{{ sharingLine(bucket) }}</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              type="button"
              class="flex size-11 items-center justify-center rounded-xl border text-xl"
              :class="bucket.starred ? 'border-accent text-star' : 'border-line text-muted'"
              :aria-pressed="!!bucket.starred"
              :aria-label="bucket.starred ? m.unstar(bucket.name) : m.star(bucket.name)"
              :title="m.starHint"
              @click="toggleStar(bucket)"
            >
              <AppIcon name="star" :filled="bucket.starred" size="size-5" />
            </button>
            <button type="button" :class="smallButton" data-testid="bucket-settings" @click="openSettings(bucket)">{{ m.settings }}</button>
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
            <p v-if="addedBySomeoneElse(i, me)" class="text-xs text-muted" data-testid="vault-added-by">{{ m.addedBy(people.nameOf(i.added_by)) }}</p>
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
      :members="editingBucket ? membersOf(shares, editingBucket.id) : []"
      @save="saveBucket"
      @delete="deleteBucket"
      @close="editingBucket = null"
    />
    <!-- Someone else's bucket: only Leave (SPEC §5 Shared Vaults). -->
    <ConfirmDialog
      ref="memberDialog"
      :heading="m.memberSettings.heading"
      :body="bucket ? m.memberSettings.about(people.ownerName(bucket.id)) : ''"
      :confirm-label="m.memberSettings.leave"
      :keep-label="m.memberSettings.close"
      @confirm="leave"
    >
      <DefaultBucketCheck v-if="bucket" class="mt-4" :model-value="!!bucket.is_default" @update:model-value="(on) => brain.setDefaultBucket(on ? bucket!.id : null)" />
    </ConfirmDialog>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 The Vault: my buckets; inside one, its items with a quick add box, check-off, ratings and links.
import { useRows } from '@/sync/useRows'
import AppIcon from '@/components/AppIcon.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import VaultItemEditor from '@/vault/components/VaultItemEditor.vue'
import BucketEditor from '@/vault/components/BucketEditor.vue'
import DefaultBucketCheck from '@/vault/components/DefaultBucketCheck.vue'
import { useBrainStore } from '@/stores/brain'
import { checkedItems, itemsInBucket, linkLabel, linkTarget } from '@/vault/rules'
import { messages } from '@/messages'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import { fieldOnPage, primaryButton, smallButton } from '@/ui/styles'
import PageHeading from '@/components/PageHeading.vue'
import RowDelete from '@/components/RowDelete.vue'
import CheckCircle from '@/components/CheckCircle.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { addedBySomeoneElse, isStar, leaveBucket, membersOf, ownsBucket, sharedWithMe, visibleBuckets } from '@/vault/sharing'
import { useVaultPeople } from '@/vault/useVaultPeople'
import { useCelebrateStore } from '@/stores/celebrate'
import { useUndoStore } from '@/stores/undo'
import { plainText } from '@/journal/body'

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
const m = messages.vault

const me = computed(() => brain.userId ?? '')
const shares = useRows('vault_shares')
// Deleted star rows are kept: toggling a star brings my old row back rather than adding another (SPEC §5 Shared Vaults).
const stars = useRows('vault_stars', [], { includeDeleted: true })
const rawBuckets = useRows('vault_buckets')
// Mine and ones shared with me, each shared one with my own star (SPEC §5 Shared Vaults).
const buckets = computed(() => visibleBuckets(rawBuckets.value, shares.value, stars.value, me.value))
const items = useRows('vault_items')

const bucketId = computed(() => (typeof route.query.bucket === 'string' ? route.query.bucket : null))
const bucket = computed(() => buckets.value.find((b) => b.id === bucketId.value) ?? null)
const bucketItems = computed(() => (bucket.value ? itemsInBucket(items.value, bucket.value) : []))
const checked = computed(() => (bucket.value ? checkedItems(items.value, bucket.value) : []))
const countIn = (b: VaultBucketRow) => items.value.filter((i) => i.bucket_id === b.id).length

function openBucket(b: VaultBucketRow) {
  void router.push({ query: { bucket: b.id } })
}

// ---------- Buckets ----------
const celebrate = useCelebrateStore()
const people = useVaultPeople()
onMounted(() => void people.load())
watch(() => brain.online, (on) => on && void people.load())
watch(() => shares.value.length, () => void people.load())
/** "Shared by Alice" on a bucket shared with me; "Shared with 2 people" on mine. */
function sharingLine(b: VaultBucketRow) {
  if (!ownsBucket(b, me.value)) return sharedWithMe(shares.value, me.value).has(b.id) ? m.sharedBy(people.ownerName(b.id)) : ''
  const n = membersOf(shares.value, b.id).length
  return n ? m.sharedWithCount(n) : ''
}
// My star: on my own bucket it's the bucket's; on a shared one it's mine alone, on the row that also keeps my default.
async function toggleStar(b: VaultBucketRow) {
  if (ownsBucket(b, me.value)) return brain.save('vault_buckets', { ...b, starred: !b.starred })
  const mine = stars.value.find((s) => s.bucket_id === b.id)
  if (mine) return brain.save('vault_stars', { ...mine, starred: !isStar(mine), is_default: !mine.deleted_at && !!mine.is_default, deleted_at: null })
  return brain.save('vault_stars', { id: crypto.randomUUID(), user_id: me.value, bucket_id: b.id, starred: true, is_default: false, deleted_at: null })
}
const memberDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
function openSettings(b: VaultBucketRow) {
  if (ownsBucket(b, me.value)) editingBucket.value = b
  else memberDialog.value?.open()
}
async function leave() {
  const b = bucket.value
  memberDialog.value?.close()
  if (!b) return
  try {
    await leaveBucket(b.id)
    await router.push({ query: {} })
    await brain.refresh(['vault_shares', 'vault_stars'])
    celebrate.say(m.left(b.name))
  } catch {
    celebrate.say(m.leaveFailed)
  }
}
const newBucketName = ref('')
async function createBucket() {
  const name = newBucketName.value.trim()
  if (!name) return
  await brain.createBucket(name)
  newBucketName.value = ''
}
const editingBucket = ref<VaultBucketRow | null>(null)
async function saveBucket(b: VaultBucketRow) {
  const was = !!editingBucket.value?.is_default
  await brain.save('vault_buckets', { ...b, is_default: was })
  // Only one default: ticking it here moves it from wherever it was, without asking (SPEC §5 Default bucket).
  if (!!b.is_default !== was) await brain.setDefaultBucket(b.is_default ? b.id : null)
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
  const putBack = await brain.remove('vault_items', i.id)
  await closeEditor()
  undo.offer(messages.undo.deleted(i.title), putBack)
}
async function askDelete(i: VaultItemRow) {
  undo.offer(messages.undo.deleted(i.title), await brain.remove('vault_items', i.id))
}
async function clearChecked() {
  if (!bucket.value) return
  const cleared = await brain.clearChecked(bucket.value.id)
  undo.offer(messages.undo.clearedChecked(cleared.count), cleared.undo)
}

</script>
