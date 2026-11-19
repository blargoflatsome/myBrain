<template>
  <div ref="root" class="flex flex-col gap-3 outline-none" tabindex="-1" data-testid="bucket-sharing">
    <div>
      <p class="font-medium">{{ m.shareHeading }}</p>
      <p class="text-xs text-muted">{{ m.shareHint }}</p>
    </div>
    <p v-if="!brain.online" class="text-sm text-muted" role="status">{{ m.shareOffline }}</p>
    <template v-else>
      <div v-if="members.length" class="flex flex-col gap-2">
        <p class="text-sm text-muted">{{ m.sharedWith }}</p>
        <ul class="flex flex-col gap-2">
          <li v-for="s in members" :key="s.id" class="flex items-center justify-between gap-3" data-testid="bucket-member">
            <span class="min-w-0 [overflow-wrap:anywhere]">{{ name(s.member) }}</span>
            <button type="button" :class="rowAction" :aria-label="m.stopSharingWith(name(s.member))" :disabled="busy" @click="unshare(s.member)">{{ m.stopSharing }}</button>
          </li>
        </ul>
      </div>
      <div class="flex flex-col gap-2">
        <p class="text-sm text-muted">{{ m.addPeople }}</p>
        <p v-if="loaded && !connections.length" class="text-sm">{{ m.noConnections }}</p>
        <p v-else-if="loaded && !others.length" class="text-sm">{{ m.everyoneAdded }}</p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="c in others" :key="c.friend_id" class="flex items-center justify-between gap-3" data-testid="bucket-share-option">
            <span class="flex min-w-0 items-center gap-2">
              <UserAvatar :url="c.avatar_url" size="sm" />
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ c.display_name }}</span>
            </span>
            <button type="button" :class="rowAction" :aria-label="m.shareWith(c.display_name)" :disabled="busy || members.length >= SHARE_LIMIT" @click="share(c)">{{ m.share }}</button>
          </li>
        </ul>
        <p v-if="members.length >= SHARE_LIMIT" class="text-sm text-muted">{{ m.shareLimit }}</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 The Vault, Shared Vaults: the owner shares a bucket with connections, or stops. Each change goes to the
// server straight away (online only), apart from the bucket editor's Save.
import { computed, onMounted, ref } from 'vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { myConnections, type Connection } from '@/connections/connections'
import { useBrainStore } from '@/stores/brain'
import { useCelebrateStore } from '@/stores/celebrate'
import type { VaultBucketRow, VaultShareRow } from '@/sync/types'
import { isLimit, SHARE_LIMIT, shareBucket, unshareBucket } from '@/vault/sharing'
import { useVaultPeople } from '@/vault/useVaultPeople'
import { rowAction } from '@/ui/styles'
import { messages } from '@/messages'

const props = defineProps<{ bucket: VaultBucketRow; members: VaultShareRow[] }>()
const m = messages.vault.bucketEditor
const brain = useBrainStore()
const celebrate = useCelebrateStore()
const people = useVaultPeople()

const connections = ref<Connection[]>([])
const loaded = ref(false)
const busy = ref(false)
const root = ref<HTMLElement | null>(null)
onMounted(async () => {
  if (!brain.online) return
  connections.value = await myConnections().catch(() => [])
  loaded.value = true
})
const others = computed(() => connections.value.filter((c) => !props.members.some((s) => s.member === c.friend_id)))
// A member's name: from my connections (always up to date here), else the names the Vault page loaded.
const name = (person: string) => connections.value.find((c) => c.friend_id === person)?.display_name ?? people.nameOf(person)

// The button pressed moves or goes away: keep focus in this part of the window (WCAG 2.4.3).
async function changed() {
  await brain.refresh(['vault_shares'])
  await people.load()
  root.value?.focus()
}
async function share(c: Connection) {
  busy.value = true
  try {
    await shareBucket(props.bucket.id, c.friend_id)
    await changed()
    celebrate.say(m.shared(c.display_name))
  } catch (err) {
    celebrate.say(isLimit(err) ? m.shareLimit : m.shareFailed)
  } finally {
    busy.value = false
  }
}
async function unshare(person: string) {
  const who = name(person)
  busy.value = true
  try {
    await unshareBucket(props.bucket.id, person)
    await changed()
    celebrate.say(m.unshared(who))
  } catch {
    celebrate.say(m.shareFailed)
  } finally {
    busy.value = false
  }
}
</script>
