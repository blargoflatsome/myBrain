<script setup lang="ts">
// SPEC §5 Dashboard: Post Its at the top, like sticky notes taped to the page. Several sit in a stack, newest on top,
// shown one at a time (Previous / Next, swipe, arrow keys; never automatic). On the note shown: Edit in place,
// Make a task, Done (with Undo), Move earlier / Move later.
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { boardOrder, POST_IT_COLORS } from '@/postits/rules'
import { cleanHtml, plainText } from '@/journal/body'
import { messages } from '@/messages'
import type { PostItColor, PostItRow } from '@/sync/types'

const brain = useBrainStore()
const m = messages.postIts

const notes = useLiveQuery<PostItRow[]>(async () => (brain.db ? boardOrder(await brain.db.post_its.toArray()) : []), [], [() => brain.db])

// ---------- Which note is shown ----------
const index = ref(0)
const followId = ref<string | null>(null)
const current = computed(() => notes.value[index.value] ?? null)
/** The notes peeking out underneath (up to two), drawn in their own colors. */
const under = computed(() => [1, 2].map((k) => notes.value[index.value + k]).filter((n): n is PostItRow => !!n))
watch(notes, (list) => {
  // Keep showing the same note after a change (an edit, a move, Undo); otherwise stay in range.
  if (followId.value) {
    const at = list.findIndex((n) => n.id === followId.value)
    if (at >= 0) index.value = at
  }
  if (index.value > list.length - 1) index.value = Math.max(0, list.length - 1)
})
const announcement = ref('')
function go(step: -1 | 1) {
  const to = index.value + step
  if (to < 0 || to >= notes.value.length) return
  editingId.value = null
  index.value = to
  followId.value = notes.value[to]!.id
  announcement.value = m.position(to + 1, notes.value.length)
}
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (editingId.value || target.closest('[contenteditable="true"], input, textarea, [role="radiogroup"]')) return
  if (event.key === 'ArrowLeft') go(-1)
  else if (event.key === 'ArrowRight') go(1)
  else return
  event.preventDefault()
}
// Swipe on a touch screen.
let swipeX: number | null = null
function onPointerDown(event: PointerEvent) {
  swipeX = event.pointerType === 'touch' && !editingId.value ? event.clientX : null
}
function onPointerUp(event: PointerEvent) {
  if (swipeX === null) return
  const dx = event.clientX - swipeX
  swipeX = null
  if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
}

// ---------- Editing in place ----------
const editingId = ref<string | null>(null)
const draft = ref('')
const draftColor = ref<PostItColor>('yellow')
const editError = ref('')
function startEdit(n: PostItRow) {
  editingId.value = n.id
  followId.value = n.id
  draft.value = n.body
  draftColor.value = n.color
  editError.value = ''
}
async function saveEdit(n: PostItRow) {
  if (!plainText(draft.value)) {
    editError.value = m.emptyError
    return
  }
  await brain.savePostIt({ ...n, body: draft.value, color: draftColor.value })
  editingId.value = null
  await focusAction('edit')
}
async function cancelEdit() {
  editingId.value = null
  await focusAction('edit')
}
async function focusAction(action: string) {
  await nextTick()
  document.querySelector<HTMLElement>(`[data-testid="dash-postits"] [data-action="${action}"]`)?.focus()
}

// ---------- Done (with Undo), Make a task, Move earlier / later ----------
const notice = ref('')
const undoId = ref<string | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function show(text: string, undo: string | null) {
  notice.value = text
  undoId.value = undo
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = ''
    undoId.value = null
  }, 10_000)
}
onScopeDispose(() => clearTimeout(noticeTimer))
async function done(n: PostItRow) {
  followId.value = null
  await brain.removePostIt(n.id)
  show(m.removed, n.id)
  await nextTick()
  document.querySelector<HTMLElement>('[data-testid="postit-undo"]')?.focus()
}
async function undo() {
  if (!undoId.value) return
  followId.value = undoId.value
  await brain.restorePostIt(undoId.value)
  notice.value = ''
  undoId.value = null
  await focusAction('done')
}
async function toTask(n: PostItRow) {
  followId.value = null
  await brain.postItToTask(n.id)
  show(m.madeTask, null)
}
async function move(n: PostItRow, step: -1 | 1) {
  const from = notes.value.findIndex((x) => x.id === n.id)
  followId.value = n.id
  await brain.reorderPostIts(from, from + step)
  announcement.value = m.moved(from + step + 1, notes.value.length)
  await focusAction(step < 0 ? 'earlier' : 'later')
}

const btn = 'min-h-11 rounded-xl border border-current/30 px-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40'
const navBtn = 'flex min-h-11 items-center gap-1 rounded-xl border border-line bg-surface px-3 text-sm font-medium disabled:opacity-40'
</script>

<template>
  <section
    v-if="notes.length || notice"
    class="flex flex-col items-center gap-3"
    data-testid="dash-postits"
    aria-roledescription="carousel"
    :aria-label="m.heading"
    @keydown="onKeydown"
  >
    <div v-if="current" class="postit-stack relative mb-3 w-full max-w-sm pt-3" @pointerdown="onPointerDown" @pointerup="onPointerUp">
      <!-- The notes underneath, peeking out (decoration only). -->
      <div
        v-for="(n, k) in under"
        :key="n.id"
        :class="['postit-under absolute inset-x-0 top-3 bottom-0 rounded-sm', `note-${n.color}`, `postit-under-${k + 1}`]"
        aria-hidden="true"
      />
      <Transition name="postit-flip" mode="out-in">
        <article
          :key="current.id"
          :class="['postit-card relative flex min-h-56 flex-col gap-3 rounded-sm px-5 pt-7 pb-4', `note-${editingId === current.id ? draftColor : current.color}`, editingId === current.id ? '' : 'postit-tilt']"
          aria-roledescription="slide"
          :aria-label="m.position(index + 1, notes.length)"
          data-testid="postit"
        >
          <span class="postit-tape" aria-hidden="true" />
          <template v-if="editingId === current.id">
            <RichTextEditor v-model="draft" :label="m.note(index + 1)" min-height="6rem" autofocus @update:model-value="editError = ''" />
            <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="m.color">
              <button
                v-for="c in POST_IT_COLORS"
                :key="c"
                type="button"
                role="radio"
                :aria-checked="draftColor === c"
                :class="['min-h-11 rounded-full border-2 px-3 text-sm', `note-${c}`, draftColor === c ? 'border-current' : 'border-black/10']"
                @click="draftColor = c"
              >
                <span v-if="draftColor === c" aria-hidden="true">✓ </span>{{ m.colors[c] }}
              </button>
            </div>
            <p v-if="editError" class="text-sm font-medium" role="alert">{{ editError }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" :class="[btn, 'font-semibold']" @click="saveEdit(current)">{{ m.save }}</button>
              <button type="button" :class="btn" @click="cancelEdit">{{ m.cancel }}</button>
            </div>
          </template>
          <template v-else>
            <!-- eslint-disable-next-line vue/no-v-html -- cleaned to the editor's own formatting by cleanHtml (DOMPurify) -->
            <div class="rich flex-1 text-lg" data-testid="postit-body" v-html="cleanHtml(current.body)" />
          </template>
        </article>
      </Transition>
    </div>

    <!-- What I can do with the note shown, kept off the paper so it reads like a real note. -->
    <div v-if="current && editingId !== current.id" class="flex w-full max-w-sm flex-wrap justify-center gap-2" data-testid="postit-actions">
      <button type="button" :class="navBtn" data-action="edit" @click="startEdit(current)">{{ m.edit }}</button>
      <button type="button" :class="navBtn" data-action="task" @click="toTask(current)">{{ m.toTask }}</button>
      <button type="button" :class="navBtn" data-action="done" @click="done(current)">{{ m.done }}</button>
    </div>

    <div v-if="notes.length > 1" class="flex w-full max-w-sm items-center justify-between gap-3">
      <button type="button" :class="navBtn" :disabled="index === 0" data-testid="postit-prev" @click="go(-1)">
        <span aria-hidden="true">‹</span> {{ m.previous }}
      </button>
      <span class="text-sm text-muted tabular-nums" data-testid="postit-count">{{ m.position(index + 1, notes.length) }}</span>
      <button type="button" :class="navBtn" :disabled="index === notes.length - 1" data-testid="postit-next" @click="go(1)">
        {{ m.next }} <span aria-hidden="true">›</span>
      </button>
    </div>
    <div v-if="notes.length > 1 && current && editingId !== current.id" class="flex w-full max-w-sm justify-center gap-4 text-sm">
      <button type="button" class="min-h-11 px-2 text-muted underline-offset-4 hover:underline disabled:opacity-40" data-action="earlier" :disabled="index === 0" @click="move(current, -1)">{{ m.moveEarlier }}</button>
      <button type="button" class="min-h-11 px-2 text-muted underline-offset-4 hover:underline disabled:opacity-40" data-action="later" :disabled="index === notes.length - 1" @click="move(current, 1)">{{ m.moveLater }}</button>
    </div>
    <p class="sr-only" aria-live="polite" data-testid="postit-announcement">{{ announcement }}</p>

    <div v-if="notice" class="flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3" role="status" data-testid="postit-notice">
      <span>{{ notice }}</span>
      <button v-if="undoId" type="button" class="min-h-11 rounded-xl border border-line px-4 font-semibold" data-testid="postit-undo" @click="undo">{{ m.undo }}</button>
    </div>
  </section>
</template>
