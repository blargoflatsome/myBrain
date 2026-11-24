<template>
  <div class="flex flex-col" :class="nested ? 'gap-5' : 'gap-6'">
    <p v-if="!brain.online" class="rounded-xl bg-bg p-3 text-sm" role="status">{{ m.offline }}</p>
    <section v-if="incoming.length" :class="part" aria-labelledby="incoming-heading">
      <component :is="h" id="incoming-heading" :class="partHeading">{{ m.incomingHeading }}</component>
      <ul class="flex flex-col gap-3">
        <li v-for="r in incoming" :key="r.id" class="flex flex-col gap-2" data-testid="incoming-request">
          <span class="flex min-w-0 items-center gap-2">
            <img v-if="r.avatar_url" :src="r.avatar_url" alt="" class="size-8 rounded-full" referrerpolicy="no-referrer">
            <span class="font-medium [overflow-wrap:anywhere]">{{ m.wantsToConnect(r.display_name) }}</span>
          </span>
          <span class="flex flex-wrap gap-2">
            <button type="button" :class="primaryButtonSmall" @click="answer(r, 'accept')">{{ m.accept }}</button>
            <button type="button" :class="smallButton" @click="answer(r, 'decline')">{{ m.decline }}</button>
            <button type="button" class="min-h-11 rounded-xl border border-line px-4 text-danger" @click="answer(r, 'block')">{{ m.block }}</button>
          </span>
        </li>
      </ul>
    </section>
    <section :class="part" aria-labelledby="connections-heading">
      <component :is="h" id="connections-heading" :class="partHeading">{{ m.connectionsHeading }}</component>
      <p v-if="!connections.length" class="text-sm text-muted">{{ m.none }}</p>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="c in connections" :key="c.friend_id" class="flex min-w-0 items-center justify-between gap-2" data-testid="connection">
          <RouterLink :to="`/people/${c.friend_id}`" class="flex min-h-11 min-w-0 items-center gap-2 rounded-xl" :aria-label="pm.openLabel(c.display_name)" data-testid="connection-profile-link">
            <UserAvatar :url="c.avatar_url" />
            <span class="font-medium underline-offset-4 hover:underline [overflow-wrap:anywhere]">{{ c.display_name }}</span>
          </RouterLink>
          <span class="flex shrink-0 gap-1">
            <button type="button" :class="smallButton" :aria-label="m.removeLabel(c.display_name)" @click="askEnd(c, false)">{{ m.remove }}</button>
            <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm text-danger" :aria-label="m.blockLabel(c.display_name)" @click="askEnd(c, true)">{{ m.block }}</button>
          </span>
        </li>
      </ul>
    </section>
    <section v-if="sent.length" :class="part" aria-labelledby="sent-heading">
      <component :is="h" id="sent-heading" :class="partHeading">{{ m.sentHeading }}</component>
      <ul class="flex flex-col gap-2">
        <li v-for="r in sent" :key="r.id" class="flex min-w-0 items-center justify-between gap-2" data-testid="sent-request">
          <span class="min-w-0 text-sm [overflow-wrap:anywhere]">{{ r.contact }} <span class="text-muted">· {{ m.sent }}</span></span>
          <button type="button" :class="[smallButton, 'shrink-0']" :aria-label="m.cancelLabel(r.contact)" @click="cancel(r)">{{ m.cancel }}</button>
        </li>
      </ul>
    </section>
    <section :class="part" aria-labelledby="ask-heading">
      <component :is="h" id="ask-heading" :class="partHeading">{{ m.askHeading }}</component>
      <form class="flex flex-col gap-2" novalidate @submit.prevent="ask">
        <label :class="fieldLabel">
          {{ m.askLabel }}
          <input v-model="contact" :class="field" autocomplete="off" maxlength="320">
        </label>
        <button type="submit" class="self-start" :class="primaryButtonSmall" :disabled="!brain.online">{{ m.send }}</button>
      </form>
      <p v-if="askError" class="text-sm text-danger" role="alert" data-testid="ask-error">{{ askError }}</p>
      <p class="text-sm text-muted" role="status" data-testid="ask-status">{{ askStatus }}</p>
    </section>
    <section :class="part" aria-labelledby="code-heading">
      <component :is="h" id="code-heading" :class="partHeading">{{ m.codeSection }}</component>
      <form class="flex flex-col gap-2" novalidate @submit.prevent="findCode">
        <label :class="fieldLabel">
          {{ m.codeLabel }}
          <input v-model="code" :class="[field, 'uppercase tracking-widest']" autocomplete="off" maxlength="8">
        </label>
        <button type="submit" :class="[smallButton, 'self-start']" :disabled="!brain.online">{{ m.findCode }}</button>
      </form>
      <div v-if="codeOwner" class="flex flex-wrap items-center gap-2" data-testid="code-owner">
        <span class="font-medium [overflow-wrap:anywhere]">{{ codeOwner.already_connected ? m.alreadyConnected(codeOwner.display_name) : m.connectWith(codeOwner.display_name) }}</span>
        <button v-if="!codeOwner.already_connected" type="button" :class="primaryButtonSmall" @click="useCode">{{ m.connect }}</button>
      </div>
      <p v-if="codeError" class="text-sm text-danger" role="alert" data-testid="code-error">{{ codeError }}</p>
    </section>
    <section :class="part" aria-labelledby="link-heading">
      <component :is="h" id="link-heading" :class="partHeading">{{ m.linkSection }}</component>
      <p class="text-sm text-muted">{{ m.linkHint }}</p>
      <button type="button" :class="[smallButton, 'self-start']" :disabled="!brain.online" @click="makeLink">{{ m.makeLink }}</button>
      <div v-if="fresh" class="flex flex-col gap-2 rounded-xl bg-bg p-3" data-testid="new-link">
        <span class="text-sm text-muted">{{ m.yourLink }}</span>
        <span class="text-sm [overflow-wrap:anywhere]" data-testid="new-link-url">{{ freshUrl }}</span>
        <span class="text-sm text-muted">{{ m.yourCode }}</span>
        <span class="text-2xl font-bold tracking-widest" data-testid="new-link-code">{{ fresh.code }}</span>
        <span class="flex flex-wrap gap-2">
          <button type="button" :class="smallButton" @click="copyLink">{{ m.copy }}</button>
          <button v-if="canShare" type="button" :class="smallButton" @click="shareLink">{{ m.share }}</button>
        </span>
      </div>
      <p class="text-sm text-muted" role="status">{{ linkStatus }}</p>
      <template v-if="links.length">
        <component :is="hSmall" class="text-sm font-medium">{{ m.activeLinks }}</component>
        <ul class="flex flex-col gap-2">
          <li v-for="l in links" :key="l.id" class="flex items-center justify-between gap-2 text-sm" data-testid="active-link">
            <span>{{ m.linkExpires(when(l.expires_at)) }}</span>
            <button type="button" :class="smallButton" @click="cancelOne(l.id)">{{ m.cancelLink }}</button>
          </li>
        </ul>
      </template>
    </section>

    <ConfirmDialog
      ref="confirmEnd"
      :heading="ending?.block ? m.confirmBlock.heading : m.confirmRemove.heading"
      :body="ending ? (ending.block ? m.confirmBlock.body : m.confirmRemove.body)(ending.c.display_name) : ''"
      :confirm-label="ending?.block ? m.block : m.remove"
      :keep-label="m.keep"
      @close="ending = null"
      @confirm="end"
    />
  </div>
</template>

<script setup lang="ts">
// SPEC §10 Connections: requests to answer (Accept, Decline, Block), my connections (remove or block), requests I sent,
// then the ways to connect: exact email or phone (the answer never says whether they have an account), a code, a link.
// SPEC §5 Account page, People group: the same part shows on the Connections page and in Account › People (nested).
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import {
  answerRequest,
  cancelRequest,
  cancelLink,
  createLink,
  incomingRequests,
  linkUrl,
  myConnections,
  myLinks,
  previewLink,
  useLink,
  type ActiveLink,
  type LinkOwner,
  type NewLink,
  requestConnection,
  sentRequests,
  type Connection,
  type IncomingRequest,
  type SentRequest,
} from '@/connections/connections'
import { sayWhy } from '@/server/server'
import { isEmail, isPhone } from '@/events/contacts'
import { messages } from '@/messages'
import { momentLabel } from '@/ui/dates'
import { useBrainStore } from '@/stores/brain'
import { card, field, fieldLabel, primaryButtonSmall, smallButton } from '@/ui/styles'

/** Nested: inside the Account page's People section, so headings are one level lower and parts aren't cards. */
const props = defineProps<{ nested?: boolean }>()
const h = computed(() => (props.nested ? 'h4' : 'h2'))
const hSmall = computed(() => (props.nested ? 'h5' : 'h3'))
const part = computed(() => (props.nested ? 'flex flex-col gap-3' : card))
const partHeading = computed(() => (props.nested ? 'font-medium' : 'text-lg font-semibold'))

const m = messages.connections
const pm = messages.personProfile
const brain = useBrainStore()
const incoming = ref<IncomingRequest[]>([])
const sent = ref<SentRequest[]>([])
const connections = ref<Connection[]>([])
const links = ref<ActiveLink[]>([])
async function load() {
  if (!brain.online) return
  ;[incoming.value, sent.value, connections.value, links.value] = await Promise.all([
    incomingRequests().catch(() => []),
    sentRequests().catch(() => []),
    myConnections().catch(() => []),
    myLinks().catch(() => []),
  ])
}

// ---------- Part 2: share a link or code; use someone's code ----------
const fresh = ref<NewLink | null>(null)
const freshUrl = computed(() => (fresh.value ? linkUrl(fresh.value.token) : ''))
const linkStatus = ref('')
const canShare = typeof navigator !== 'undefined' && 'share' in navigator
const when = (iso: string) => momentLabel(iso)
async function makeLink() {
  linkStatus.value = ''
  try {
    fresh.value = await createLink()
    await load()
  } catch (e) {
    linkStatus.value = sayWhy(e, { offline: m.offline, limit: m.linkLimit, failed: m.failed })
  }
}
async function copyLink() {
  await navigator.clipboard?.writeText(freshUrl.value).catch(() => {})
  linkStatus.value = m.copied
}
function shareLink() {
  void navigator.share?.({ title: m.linkHeading, text: `${m.yourCode}: ${fresh.value?.code}`, url: freshUrl.value }).catch(() => {})
}
async function cancelOne(id: string) {
  try {
    await cancelLink(id)
  } catch (e) {
    return (linkStatus.value = sayWhy(e, { offline: m.offline, limit: m.failed, failed: m.failed }))
  }
  if (fresh.value?.id === id) fresh.value = null
  await load()
}
const code = ref('')
const codeOwner = ref<LinkOwner | null>(null)
const codeError = ref('')
async function findCode() {
  codeOwner.value = null
  codeError.value = ''
  try {
    codeOwner.value = (await previewLink({ code: code.value }))[0] ?? null
    if (!codeOwner.value) codeError.value = m.codeGone
  } catch (e) {
    codeError.value = sayWhy(e, { offline: m.offline, limit: m.triesLimit, failed: m.failed })
  }
}
async function useCode() {
  let name: string | null = null
  try {
    name = await useLink({ code: code.value })
  } catch (e) {
    return (codeError.value = sayWhy(e, { offline: m.offline, limit: m.triesLimit, failed: m.codeGone }))
  }
  if (!name) return (codeError.value = m.codeGone)
  codeOwner.value = null
  code.value = ''
  askStatus.value = m.accepted(name)
  await load()
}
onMounted(load)

const contact = ref('')
const askError = ref('')
const askStatus = ref('')
async function ask() {
  askStatus.value = ''
  const typed = contact.value.trim()
  if (!isEmail(typed) && !isPhone(typed)) return (askError.value = m.askInvalid)
  askError.value = ''
  try {
    await requestConnection(typed)
    // The same answer whatever was typed: it never says whether they have an account.
    askStatus.value = m.askSent
    contact.value = ''
    await load()
  } catch (e) {
    askError.value = sayWhy(e, { offline: m.offline, limit: m.askLimit, failed: m.failed })
  }
}

/** Run a change to my requests or connections; a failure shows above the lists, and false means it didn't happen. */
async function tryIt(change: () => Promise<unknown>): Promise<boolean> {
  askError.value = ''
  try {
    await change()
    return true
  } catch (e) {
    askError.value = sayWhy(e, { offline: m.offline, limit: m.failed, failed: m.failed })
    return false
  }
}
async function answer(r: IncomingRequest, a: 'accept' | 'decline' | 'block') {
  if (!(await tryIt(() => answerRequest(r.id, a)))) return
  askStatus.value = a === 'accept' ? m.accepted(r.display_name) : ''
  await load()
}
async function cancel(r: SentRequest) {
  if (!(await tryIt(() => cancelRequest(r.id)))) return
  await load()
}

const confirmEnd = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const ending = ref<{ c: Connection; block: boolean } | null>(null)
function askEnd(c: Connection, block: boolean) {
  ending.value = { c, block }
  confirmEnd.value?.open()
}
async function end() {
  const e = ending.value
  confirmEnd.value?.close()
  if (e && !(await tryIt(() => brain.removeConnection(e.c.friend_id, e.block)))) return
  await load()
}
</script>
