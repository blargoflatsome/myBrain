<script setup lang="ts">
// SPEC §5 Dashboard: Post Its at the top, newest first. Edit in place, Make a task, Done (with Undo), reorder.
import { nextTick, onScopeDispose, ref, watch } from 'vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { arrowStep, useDragSort } from '@/composables/useDragSort'
import { boardOrder, POST_IT_COLORS } from '@/postits/rules'
import { cleanHtml, plainText } from '@/journal/body'
import { messages } from '@/messages'
import type { PostItColor, PostItRow } from '@/sync/types'

const brain = useBrainStore()
const m = messages.postIts

const notes = useLiveQuery<PostItRow[]>(async () => (brain.db ? boardOrder(await brain.db.post_its.toArray()) : []), [], [() => brain.db])

// ---------- Editing in place ----------
const editingId = ref<string | null>(null)
const draft = ref('')
const draftColor = ref<PostItColor>('yellow')
const editError = ref('')
async function startEdit(n: PostItRow) {
  editingId.value = n.id
  draft.value = n.body
  draftColor.value = n.color
  editError.value = ''
}
async function saveEdit(n: PostItRow) {
  if (!plainText(draft.value)) {
    editError.value = messages.postIts.emptyError
    return
  }
  await brain.savePostIt({ ...n, body: draft.value, color: draftColor.value })
  editingId.value = null
  await nextTick()
  focusNote(n.id, 'edit')
}
async function cancelEdit(n: PostItRow) {
  editingId.value = null
  await nextTick()
  focusNote(n.id, 'edit')
}
function focusNote(id: string, action: string) {
  document.querySelector<HTMLElement>(`[data-note="${id}"] [data-action="${action}"]`)?.focus()
}

// ---------- Done (with Undo) and Make a task ----------
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
  await brain.removePostIt(n.id)
  show(m.removed, n.id)
  await nextTick()
  document.querySelector<HTMLElement>('[data-testid="postit-undo"]')?.focus()
}
async function undo() {
  if (!undoId.value) return
  const id = undoId.value
  await brain.restorePostIt(id)
  notice.value = ''
  undoId.value = null
  await nextTick()
  focusNote(id, 'done')
}
async function toTask(n: PostItRow) {
  await brain.postItToTask(n.id)
  show(m.madeTask, null)
}

// ---------- Reordering: drag the handle, tap it for Move up / Move down, or the arrow keys ----------
const list = ref<HTMLUListElement | null>(null)
useDragSort(list, (from, to) => brain.reorderPostIts(from, to))
const movingId = ref<string | null>(null)
let moves: Promise<void> = Promise.resolve()
const followId = ref<string | null>(null)
function move(id: string, step: -1 | 1) {
  followId.value = id
  moves = moves
    .then(async () => {
      const from = notes.value.findIndex((n) => n.id === id)
      const to = from + step
      if (from < 0 || to < 0 || to >= notes.value.length) return
      await brain.reorderPostIts(from, to)
      for (let i = 0; i < 50 && notes.value.findIndex((n) => n.id === id) !== to; i++) await new Promise((r) => setTimeout(r, 20))
    })
    .catch(() => {})
}
function moveByKey(event: KeyboardEvent, id: string) {
  const step = arrowStep(event)
  if (!step) return
  event.preventDefault()
  move(id, step)
}
// Keep focus on the control being used while the board redraws in its new order.
watch(
  notes,
  () => {
    if (!followId.value) return
    const el = list.value?.querySelector<HTMLElement>(`[data-note="${followId.value}"] [data-follow]`)
    if (el && document.activeElement !== el && list.value?.contains(document.activeElement) === false) el.focus()
  },
  { flush: 'post' },
)
const btn = 'min-h-11 rounded-xl border border-current/30 px-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10'
</script>

<template>
  <section v-if="notes.length || notice" class="flex flex-col gap-3" data-testid="dash-postits" aria-labelledby="dash-postits-heading">
    <h2 id="dash-postits-heading" class="sr-only">{{ m.heading }}</h2>
    <ul ref="list" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="(n, i) in notes"
        :key="n.id"
        :data-note="n.id"
        class="flex flex-col gap-2 rounded-lg p-3 shadow-sm"
        :class="`note-${editingId === n.id ? draftColor : n.color}`"
        :aria-label="m.note(i + 1)"
        data-testid="postit"
      >
        <div class="flex items-start gap-1">
          <button
            type="button"
            class="drag-handle -ml-1 flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-xl opacity-70 active:cursor-grabbing"
            :aria-label="m.drag(i + 1)"
            :aria-expanded="movingId === n.id"
            data-follow
            @keydown="moveByKey($event, n.id)"
            @click="movingId = movingId === n.id ? null : n.id"
          >
            <span aria-hidden="true">⠿</span>
          </button>
          <!-- eslint-disable-next-line vue/no-v-html -- cleaned to the editor's own formatting by cleanHtml (DOMPurify) -->
          <div v-if="editingId !== n.id" class="rich min-w-0 flex-1 pt-2" data-testid="postit-body" v-html="cleanHtml(n.body)" />
        </div>
        <div v-if="movingId === n.id" class="flex gap-2" role="group" :aria-label="m.moveGroup(i + 1)">
          <button type="button" :class="[btn, 'flex-1']" :disabled="i === 0" @click="move(n.id, -1)">↑ {{ messages.moveUp }}</button>
          <button type="button" :class="[btn, 'flex-1']" :disabled="i === notes.length - 1" @click="move(n.id, 1)">↓ {{ messages.moveDown }}</button>
        </div>

        <template v-if="editingId === n.id">
          <RichTextEditor v-model="draft" :label="m.note(i + 1)" min-height="6rem" autofocus @update:model-value="editError = ''" />
          <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="m.color">
            <button
              v-for="c in POST_IT_COLORS"
              :key="c"
              type="button"
              role="radio"
              :aria-checked="draftColor === c"
              :class="['min-h-11 rounded-full border-2 px-3 text-sm', `note-${c}`, draftColor === c ? 'border-current' : 'border-transparent']"
              @click="draftColor = c"
            >
              <span v-if="draftColor === c" aria-hidden="true">✓ </span>{{ m.colors[c] }}
            </button>
          </div>
          <p v-if="editError" class="text-sm font-medium" role="alert">{{ editError }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" :class="[btn, 'font-semibold']" @click="saveEdit(n)">{{ m.save }}</button>
            <button type="button" :class="btn" @click="cancelEdit(n)">{{ m.cancel }}</button>
          </div>
        </template>
        <div v-else class="mt-auto flex flex-wrap gap-2">
          <button type="button" :class="btn" data-action="edit" @click="startEdit(n)">{{ m.edit }}</button>
          <button type="button" :class="btn" data-action="task" @click="toTask(n)">{{ m.toTask }}</button>
          <button type="button" :class="btn" data-action="done" @click="done(n)">{{ m.done }}</button>
        </div>
      </li>
    </ul>
    <div v-if="notice" class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3" role="status" data-testid="postit-notice">
      <span>{{ notice }}</span>
      <button v-if="undoId" type="button" class="min-h-11 rounded-xl border border-line px-4 font-semibold" data-testid="postit-undo" @click="undo">{{ m.undo }}</button>
    </div>
  </section>
</template>
