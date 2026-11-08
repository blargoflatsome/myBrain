<template>
  <section
    v-if="notes.length || notice"
    class="flex flex-col items-center gap-3"
    data-testid="dash-postits"
    aria-roledescription="carousel"
    :aria-label="m.heading"
    @keydown="onKeydown"
  >
    <!-- On a computer, arrows sit either side of the stack and appear when the mouse is over it (or a key reaches them). -->
    <!-- px-3 on a phone leaves room for the tilted notes underneath, so they never stick out past the screen. -->
    <div v-if="current" class="group relative w-full max-w-sm px-3 md:px-0" data-testid="postit-carousel">
      <!-- touch-pan-y: the page still scrolls up and down, but a sideways swipe comes to the stack instead of being
         taken by the browser (which would cancel the touch before it ends). -->
      <div
        class="postit-stack relative mb-3 w-full touch-pan-y pt-3"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      >
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
            <button
              v-if="editingId !== current.id"
              type="button"
              :class="[icon, 'absolute top-1 right-1']"
              :aria-label="m.delete"
              :title="m.delete"
              data-action="delete"
              @click="deleteNote(current)"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
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
              <div class="rich flex-1 pr-6 text-lg" data-testid="postit-body" v-html="cleanHtml(current.body)" />
              <button type="button" :class="[icon, '-mb-2 -ml-3 self-start']" :aria-label="m.edit" :title="m.edit" data-action="edit" @click="startEdit(current)">
                <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
              </button>
            </template>
          </article>
        </Transition>
      </div>
      <button
        v-if="notes.length > 1 && index > 0"
        type="button"
        :class="[arrow, '-left-16']"
        :aria-label="m.previous"
        data-testid="postit-prev"
        @click="go(-1)"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        v-if="notes.length > 1 && index < notes.length - 1"
        type="button"
        :class="[arrow, '-right-16']"
        :aria-label="m.next"
        data-testid="postit-next"
        @click="go(1)"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>


    <!-- Computer: where I am in the stack. -->
    <p v-if="notes.length > 1" class="hidden text-sm text-muted tabular-nums md:block" data-testid="postit-count">{{ m.position(index + 1, notes.length) }}</p>
    <!-- Phone: swipe, or tap a dot (a tap is needed as well as the swipe, WCAG 2.5.1). -->
    <div v-if="notes.length > 1" class="flex flex-wrap justify-center gap-1 md:hidden" data-testid="postit-dots">
      <button
        v-for="(n, i) in notes"
        :key="n.id"
        type="button"
        class="flex size-8 items-center justify-center rounded-full"
        :aria-label="m.showNote(i + 1, notes.length)"
        :aria-current="i === index ? 'true' : undefined"
        @click="show_(i)"
      >
        <span class="block rounded-full transition-all" :class="i === index ? 'h-2.5 w-5 bg-ink' : 'size-2.5 border border-control bg-transparent'" aria-hidden="true" />
      </button>
    </div>
    <p class="sr-only" aria-live="polite" data-testid="postit-announcement">{{ announcement }}</p>

    <div v-if="notice" class="flex w-full max-w-sm items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3" role="status" data-testid="postit-notice">
      <span>{{ notice }}</span>
      <button v-if="undoId" type="button" class="min-h-11 rounded-xl border border-line px-4 font-semibold" data-testid="postit-undo" @click="undo">{{ m.undo }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard: Post Its at the top, like sticky notes taped to the page. Several sit in a stack, newest on top,
// shown one at a time (never automatic): Previous / Next on a computer; swipe or tap a dot on a phone; arrow keys.
// On the note shown: an edit icon (bottom left) to edit in place, and an X (top right) that deletes it, with Undo.
import { computed, defineAsyncComponent, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { boardOrder, POST_IT_COLORS } from '@/postits/rules'
import { cleanHtml, plainText } from '@/journal/body'
import { messages } from '@/messages'
import type { PostItColor, PostItRow } from '@/sync/types'

// The formatting editor (Tiptap) is large, so it loads the first time it's shown, not with the app.
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))

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
  const fromArrow = (document.activeElement as HTMLElement | null)?.dataset.testid
  show_(index.value + step)
  // At either end one arrow goes away: keep focus on the other one rather than losing it.
  if (fromArrow === 'postit-prev' || fromArrow === 'postit-next') {
    void nextTick(() => {
      const same = document.querySelector<HTMLElement>(`[data-testid="${fromArrow}"]`)
      const other = document.querySelector<HTMLElement>(`[data-testid="${fromArrow === 'postit-prev' ? 'postit-next' : 'postit-prev'}"]`)
      ;(same ?? other)?.focus()
    })
  }
}
/** Show the note at this place in the stack (the dots on a phone jump straight to one). */
function show_(to: number) {
  if (to < 0 || to >= notes.value.length || to === index.value) return
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
let swipeX: number | null = null
function onPointerDown(event: PointerEvent) {
  swipeX = event.pointerType === 'touch' && !editingId.value ? event.clientX : null
}
function onPointerCancel() {
  swipeX = null
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

// ---------- Delete (with Undo) ----------
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
async function deleteNote(n: PostItRow) {
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
  await focusAction('delete')
}

const btn = 'min-h-11 rounded-xl border border-current/30 px-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40'
// Hidden until the mouse is over the stack or the keyboard reaches an arrow (so keyboard users always find them).
const arrow =
  'absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-3xl leading-none text-ink shadow-md opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 md:flex'
// Small round icon buttons on the paper (44 px to tap), in the note's own ink colour.
const icon = 'flex size-11 items-center justify-center rounded-full opacity-70 hover:bg-black/10 hover:opacity-100 focus-visible:opacity-100'
</script>
