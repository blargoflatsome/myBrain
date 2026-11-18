<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 pb-28 md:px-8">
    <PageHeading :heading="m.heading" :intro="m.subtitle" intro-test-id="cheers-subtitle" />
    <p v-if="!brain.online" class="rounded-xl bg-bg p-3 text-sm" role="status" data-testid="cheers-offline">{{ m.offline }}</p>

    <div v-if="cheers.draft === null" class="flex flex-wrap gap-2">
      <button type="button" :class="primaryButton" :disabled="!brain.online" data-testid="cheers-did-it" @click="startDidIt">{{ m.didIt }}</button>
      <button type="button" :class="secondaryButton" :disabled="!brain.online || posting" data-testid="cheers-stuck" @click="postStuck">{{ m.stuck }}</button>
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
        <button type="button" :class="[smallButton, 'ml-auto']" :disabled="!brain.online || loading" data-testid="cheers-refresh" @click="load">{{ m.refresh }}</button>
      </div>
      <p v-if="loadFailed" class="text-sm text-danger" role="alert">{{ m.loadFailed }}</p>
      <p v-else-if="loaded && !posts.length" class="text-muted" data-testid="cheers-empty">{{ m.empty }}</p>
      <ul class="flex flex-col gap-3" data-testid="cheers-feed">
        <CheerPostCard v-for="p in posts" :key="p.id" :post="p" :now="now" :busy="reacting === p.id" @react="react" @hide="askHide" />
      </ul>
    </section>

    <ConfirmDialog ref="hideDialog" :heading="m.hide" :body="m.hideConfirm" :confirm-label="m.hideYes" :keep-label="m.cancel" @confirm="hide" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Cheers: the anonymous 48-hour feed, I did it!, I'm stuck (with Breathe), reactions and Hide posts from this
// person. Everything comes from the server; nothing here is kept on the device.
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PageHeading from '@/components/PageHeading.vue'
import CheerPostCard from '@/cheers/components/CheerPostCard.vue'
import { cheerFeed, hideAuthor, postCheer, reactCheer, reasonOf, stuckCount, type CheerPost } from '@/cheers/cheers'
import { MAX_CHARS, pickOne, type Reaction } from '@/cheers/rules'
import { useNow } from '@/composables/useNow'
import { useBrainStore } from '@/stores/brain'
import { useBreatheStore } from '@/stores/breathe'
import { useCelebrateStore } from '@/stores/celebrate'
import { useCheersStore } from '@/stores/cheers'
import { achieved } from '@/celebrate/bus'
import { card, field, fieldLabel, primaryButton, primaryButtonSmall, secondaryButton, smallButton } from '@/ui/styles'
import { messages } from '@/messages'

const m = messages.cheers
const brain = useBrainStore()
const breathe = useBreatheStore()
const celebrate = useCelebrateStore()
const cheers = useCheersStore()
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
onMounted(load)
watch(() => brain.online, (on) => on && void load())

// ---------- Posting ----------
const box = ref<HTMLTextAreaElement | null>(null)
const posting = ref(false)
const formError = ref('')
const postError = ref('')
const left = computed(() => MAX_CHARS - (cheers.draft ?? '').length)
const failure = (err: unknown) => (reasonOf(err) === 'limit' ? m.limit : m.postFailed)

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
    await postCheer('did_it', text)
    cheers.draft = null
    celebrate.say(m.posted)
    achieved({ kind: 'cheer_post' })
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
    await postCheer('stuck')
    cheers.setStuck(true)
    achieved({ kind: 'cheer_post' })
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

// ---------- Reacting and hiding ----------
const reacting = ref<string | null>(null)
async function react(post: CheerPost, reaction: Reaction) {
  reacting.value = post.id
  try {
    await reactCheer(post.id, reaction)
    post.my_reaction = reaction
    // The smug line is only ever for the one cheering (SPEC §5 Cheers).
    celebrate.say(pickOne(m.afterReact))
    achieved({ kind: 'cheer' })
    void celebrate.refreshCounts().then(() => celebrate.checkTrophies())
  } catch {
    celebrate.say(m.reactFailed)
  } finally {
    reacting.value = null
  }
}

const hideDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const hiding = ref<CheerPost | null>(null)
function askHide(post: CheerPost) {
  hiding.value = post
  hideDialog.value?.open()
}
async function hide() {
  const post = hiding.value
  hideDialog.value?.close()
  if (!post) return
  try {
    await hideAuthor(post.id)
    celebrate.say(m.hidden)
    await load()
  } catch {
    celebrate.say(m.postFailed)
  }
}
</script>
