<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 pb-28 md:px-8">
    <PageHeading :heading="m.heading" :intro="m.subtitle" intro-test-id="cheers-subtitle" />
    <p v-if="!brain.online" class="rounded-xl bg-bg p-3 text-sm" role="status" data-testid="cheers-offline">{{ m.offline }}</p>

    <div v-if="cheers.draft === null" class="flex flex-wrap gap-2">
      <button type="button" :class="primaryButton" :disabled="!brain.online" data-testid="cheers-did-it" @click="startDidIt">{{ m.didIt }}</button>
      <button v-if="cheers.stuckToday()" type="button" :class="secondaryButton" :disabled="!brain.online || posting" data-testid="cheers-unstuck" @click="postUnstuck">{{ m.unstuck }}</button>
      <button v-else type="button" :class="secondaryButton" :disabled="!brain.online || posting" data-testid="cheers-stuck" @click="postStuck">{{ m.stuck }}</button>
    </div>

    <form v-else :class="card" novalidate data-testid="did-it-form" @submit.prevent="postDidIt">
      <label :class="fieldLabel">
        <span>{{ m.didItLabel }}</span>
        <textarea
          ref="box"
          v-model="cheers.draft"
          :class="[field, 'min-h-24 py-2 [field-sizing:content]']"
          :maxlength="MAX_CHARS"
          rows="3"
          :aria-invalid="formError ? 'true' : undefined"
          :aria-describedby="`${hintId} ${countId}${formError ? ` ${errorId}` : ''}`"
          data-testid="did-it-text"
        />
      </label>
      <p :id="hintId" class="text-sm text-muted">{{ m.didItHint }}</p>
      <!-- Heard only near the limit, so screen readers aren't told every keystroke. -->
      <p :id="countId" class="text-sm text-muted" :aria-live="left <= 20 ? 'polite' : 'off'" data-testid="did-it-left">{{ m.left(left) }}</p>
      <p v-if="formError" :id="errorId" class="text-sm text-danger" role="alert" data-testid="did-it-error">{{ formError }}</p>
      <div class="flex flex-wrap gap-2">
        <button type="submit" :class="primaryButtonSmall" :disabled="!brain.online || posting" data-testid="did-it-post">{{ m.post }}</button>
        <button type="button" :class="smallButton" @click="cancelDidIt">{{ m.cancel }}</button>
      </div>
    </form>
    <p v-if="postError" class="text-sm text-danger" role="alert" data-testid="cheers-post-error">{{ postError }}</p>

    <!-- After I'm stuck: sincere, never a joke (SPEC §5 Cheers). -->
    <section v-if="stuckPanel" ref="stuckSection" :class="card" tabindex="-1" aria-labelledby="stuck-heading" data-testid="stuck-panel">
      <h2 id="stuck-heading" class="text-lg font-semibold">{{ stuckPanel.others > 0 ? m.notAlone : m.stuck }}</h2>
      <p v-if="stuckPanel.others > 0" data-testid="stuck-others">{{ m.othersStuck(stuckPanel.others) }}</p>
      <p data-testid="stuck-line">{{ stuckPanel.line }}</p>
      <button type="button" :class="[secondaryButton, 'flex items-center gap-2 self-start']" data-testid="stuck-breathe" @click="breathe.open()">
        <AppIcon name="wind" size="size-5" />
        {{ m.breathe }}
      </button>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="feed-heading">
      <div class="flex items-center justify-between gap-2">
        <h2 id="feed-heading" class="sr-only">{{ m.heading }}</h2>
        <button type="button" :class="[smallButton, 'ml-auto']" :disabled="!brain.online || loading" data-testid="cheers-refresh" @click="refresh">{{ loading ? m.refreshing : m.refresh }}</button>
      </div>
      <p v-if="loadFailed" class="text-sm text-danger" role="alert">{{ m.loadFailed }}</p>
      <p v-else-if="loaded && !posts.length" class="text-muted" data-testid="cheers-empty">{{ m.empty }}</p>
      <ul class="flex flex-col gap-3" data-testid="cheers-feed">
        <CheerPostCard v-for="p in posts" :key="p.id" :post="p" :now="now" :busy="reacting === p.id" @react="react" @unreact="unreact" @hide="hide" />
      </ul>
    </section>

    <!-- Hidden people: known only by the post I hid them from (SPEC §5 Cheers). -->
    <MoreOptions v-if="hidden.length" :title="m.hiddenHeading" :summary="m.hiddenCount(hidden.length)" test-id="cheers-hidden">
      <ul ref="hiddenList" class="flex flex-col gap-3">
        <li v-for="h in hidden" :key="h.id" class="flex items-center gap-3" data-testid="hidden-person">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <p class="[overflow-wrap:anywhere]" data-testid="hidden-post">{{ hiddenText(h) }}</p>
            <p class="text-xs text-muted">{{ m.hiddenOn(dayOfLabel(h.created_at, now)) }}</p>
          </div>
          <button type="button" :class="rowAction" :aria-label="m.showAgainLabel(hiddenText(h))" data-testid="show-again" @click="unhide(h)">{{ m.showAgain }}</button>
        </li>
      </ul>
    </MoreOptions>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Cheers: the anonymous 48-hour feed, I did it!, I'm stuck (with Breathe), reactions and Hide posts from this
// person. Everything comes from the server; nothing here is kept on the device.
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import PageHeading from '@/components/PageHeading.vue'
import CheerPostCard from '@/cheers/components/CheerPostCard.vue'
import { cheerFeed, cheerOn, hiddenPeople, hideAuthor, postCheer, shareCheer, showAgain, stuckCount, unreactCheer, type CheerPost, type HiddenPerson } from '@/cheers/cheers'
import { sayWhy } from '@/server/server'
import { MAX_CHARS, pickOne, postText, type Reaction } from '@/cheers/rules'
import { useNow } from '@/composables/useNow'
import { useBrainStore } from '@/stores/brain'
import { useBreatheStore } from '@/stores/breathe'
import { useCelebrateStore } from '@/stores/celebrate'
import { useCheersStore } from '@/stores/cheers'
import { useUndoStore } from '@/stores/undo'
import { dayOfLabel } from '@/ui/dates'
import { card, field, fieldLabel, primaryButton, primaryButtonSmall, rowAction, secondaryButton, smallButton } from '@/ui/styles'
import { messages } from '@/messages'

const m = messages.cheers
const brain = useBrainStore()
const breathe = useBreatheStore()
const celebrate = useCelebrateStore()
const cheers = useCheersStore()
const undo = useUndoStore()
const now = useNow(60_000)
const hintId = useId()
const countId = useId()
const errorId = useId()

const posts = ref<CheerPost[]>([])
const loading = ref(false)
const loaded = ref(false)
const loadFailed = ref(false)
async function load() {
  if (!brain.online) return
  loading.value = true
  try {
    posts.value = await cheerFeed()
    loadFailed.value = false
    loaded.value = true
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  void load()
  void loadHidden()
})
// SPEC §2 Buttons answer every press: Refresh says it's working, then that the feed is up to date.
async function refresh() {
  await load()
  if (!loadFailed.value) celebrate.say(m.refreshed)
}
watch(() => brain.online, (on) => {
  if (!on) return
  void load()
  void loadHidden()
})

// ---------- Posting ----------
const box = ref<HTMLTextAreaElement | null>(null)
const posting = ref(false)
const formError = ref('')
const postError = ref('')
const left = computed(() => MAX_CHARS - (cheers.draft ?? '').length)
const failure = (err: unknown) => sayWhy(err, { offline: m.offline, limit: m.limit, failed: m.postFailed })

async function startDidIt() {
  cheers.draft = ''
  postError.value = ''
  await nextTick()
  box.value?.focus()
}
// An offer's Share fills the box: put me in it.
watch(() => cheers.draft !== null, async (open) => {
  if (!open) return
  await nextTick()
  box.value?.focus()
}, { immediate: true })
function cancelDidIt() {
  cheers.draft = null
  formError.value = ''
}
async function postDidIt() {
  const text = (cheers.draft ?? '').trim()
  formError.value = !text ? m.needText : text.length > MAX_CHARS ? m.tooLong : ''
  if (formError.value) return box.value?.focus()
  posting.value = true
  try {
    await shareCheer('did_it', text)
    cheers.draft = null
    celebrate.say(m.posted)
    await load()
  } catch (err) {
    formError.value = failure(err)
  } finally {
    posting.value = false
  }
}

const stuckPanel = ref<{ others: number; line: string } | null>(null)
const stuckSection = ref<HTMLElement | null>(null)
async function postStuck() {
  posting.value = true
  postError.value = ''
  try {
    await shareCheer('stuck')
    cheers.setStuck(true)
    const others = await stuckCount().catch(() => 0)
    stuckPanel.value = { others, line: pickOne(m.stuckLines) }
    await nextTick()
    stuckSection.value?.focus()
    await load()
  } catch (err) {
    postError.value = failure(err)
  } finally {
    posting.value = false
  }
}

// While I'm stuck, I got unstuck! takes I'm stuck's place, so I can post it without waiting to be offered.
async function postUnstuck() {
  posting.value = true
  postError.value = ''
  try {
    await postCheer('unstuck')
    cheers.setStuck(false)
    stuckPanel.value = null
    celebrate.say(m.posted)
    await load()
  } catch (err) {
    postError.value = failure(err)
  } finally {
    posting.value = false
  }
}

// ---------- Reacting and hiding ----------
const reacting = ref<string | null>(null)
async function react(post: CheerPost, reaction: Reaction) {
  reacting.value = post.id
  try {
    // Tapping another icon switches: take the one I sent back first (SPEC §5 Cheers, Compact).
    if (post.my_reaction) {
      await unreactCheer(post.id)
      post.my_reaction = null
    }
    await cheerOn(post.id, reaction)
    post.my_reaction = reaction
    // The smug line is only ever for the one cheering (SPEC §5 Cheers).
    celebrate.say(pickOne(m.afterReact))
  } catch {
    celebrate.say(m.reactFailed)
  } finally {
    reacting.value = null
  }
}

async function unreact(post: CheerPost) {
  reacting.value = post.id
  try {
    await unreactCheer(post.id)
    post.my_reaction = null
  } catch {
    celebrate.say(m.reactFailed)
  } finally {
    reacting.value = null
  }
}

// Hiding happens straight away, with Undo (SPEC §5 Cheers, Block).
async function hide(post: CheerPost) {
  try {
    const id = await hideAuthor(post.id)
    posts.value = posts.value.filter((p) => p.id !== post.id)
    undo.offer(m.hidden, async () => {
      if (id) await showAgain(id)
      await Promise.all([load(), loadHidden()])
    })
    await Promise.all([load(), loadHidden()])
  } catch {
    celebrate.say(m.hideFailed)
  }
}

// ---------- Hidden people ----------
const hidden = ref<HiddenPerson[]>([])
const hiddenList = ref<HTMLElement | null>(null)
const hiddenText = (h: HiddenPerson) => (h.post_kind ? postText(h.post_kind, h.post_body ?? '') : m.hiddenUnknown)
async function loadHidden() {
  if (!brain.online) return
  try {
    hidden.value = await hiddenPeople()
  } catch {
    // The list just doesn't show; the feed says if Cheers can't load.
  }
}
async function unhide(h: HiddenPerson) {
  const at = hidden.value.indexOf(h)
  try {
    await showAgain(h.id)
    hidden.value = hidden.value.filter((x) => x.id !== h.id)
    celebrate.say(m.shownAgain)
    // The button I pressed is gone: keep focus nearby, on the next Show again or else Refresh (WCAG 2.4.3).
    await nextTick()
    const buttons = hiddenList.value?.querySelectorAll<HTMLElement>('[data-testid="show-again"]')
    const next = buttons?.[Math.min(at, buttons.length - 1)] ?? document.querySelector<HTMLElement>('[data-testid="cheers-refresh"]')
    next?.focus()
    await load()
  } catch {
    celebrate.say(m.hideFailed)
  }
}
</script>
