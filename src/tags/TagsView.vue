<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
    <p v-if="uses.length" class="text-sm text-muted">{{ m.intro }}</p>
    <p v-else class="text-muted">{{ m.empty }}</p>
    <!-- SPEC §2 Undo in place: a renamed tag moves to its new place in A to Z, so its Undo shows here. -->
    <UndoLine v-for="l in undoable.ownLines()" :key="l.key" :line="l" tag="p" @undo="(el) => undoable.run(l, el)" />
    <ul class="flex flex-col gap-2">
      <template v-for="{ key, row: u, line } in undoable.placed(rows)" :key="key">
        <UndoLine v-if="line" :line="line" @undo="(el) => undoable.run(line, el)" />
        <li v-else-if="u" class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3" data-testid="tag-row">
          <button
            type="button"
            class="flex min-h-11 min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
            @click="search.open(u.tag.id)"
          >
            <span class="sr-only">{{ m.showItems }}</span>
            <span class="max-w-full font-medium break-words" data-testid="tag-name">#{{ u.tag.name }}</span>
            <span class="text-xs text-muted" data-testid="tag-counts">{{ m.counts(u.counts) }}</span>
          </button>
          <button type="button" :class="rowAction" :aria-label="m.editLabel(u.tag.name)" @click="editing = u.tag">
            <AppIcon name="pencil" />{{ m.edit }}
          </button>
        </li>
      </template>
    </ul>
    <TagEditor :tag="editing" :tags="uses.map((u) => u.tag)" @rename="rename" @merge="merge" @delete="remove" @close="editing = null" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Tags page: every tag A to Z with what it's on; tap one to search by it; rename, merge or delete in the
// tag's window. Each change happens straight away with Undo (SPEC §2 Calm by design).
import { readTables } from '@/sync/db'
import { useDeviceQuery } from '@/sync/useRows'
import { computed, ref } from 'vue'
import UndoLine from '@/components/UndoLine.vue'
import { useUndoInPlace } from '@/composables/useUndoInPlace'
import AppIcon from '@/components/AppIcon.vue'
import TagEditor from '@/tags/components/TagEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useSearchStore } from '@/stores/search'
import { cleanTagName, tagUsage, type TagUse } from '@/tags/rules'
import { messages } from '@/messages'
import type { TagRow } from '@/sync/types'
import { rowAction } from '@/ui/styles'

const brain = useBrainStore()
const search = useSearchStore()
const undoable = useUndoInPlace()
const m = messages.tagsPage
const editing = ref<TagRow | null>(null)

const uses = useDeviceQuery<TagUse[]>(async (db) => {
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))
  const t = await readTables(db, { tags: 'tags', links: 'item_tags', tasks: 'tasks', habits: 'habits', routines: 'routines' })
  return tagUsage(t.tags, t.links, { task: ids(t.tasks), habit: ids(t.habits), routine: ids(t.routines) })
}, [])
const rows = computed(() => uses.value.map((u) => ({ ...u, id: u.tag.id })))
const placeOf = (tag: TagRow) => ({ row: { id: tag.id, in: rows.value } })

/** Returns the tag a new name clashes with, so the window can offer to merge. */
async function rename(tag: TagRow, name: string, done: (clash: TagRow | null) => void) {
  const result = await brain.renameTag(tag, name)
  if (result && 'clash' in result) return done(result.clash)
  done(null)
  editing.value = null
  if (result) undoable.offer(m.renamed(tag.name, cleanTagName(name)), result.undo)
}
async function merge(from: TagRow, into: TagRow) {
  const place = placeOf(from)
  editing.value = null
  undoable.offer(m.merged(from.name, into.name), await brain.mergeTags(from.id, into.id), place)
}
async function remove(tag: TagRow) {
  const place = placeOf(tag)
  editing.value = null
  undoable.offer(m.deleted(tag.name), await brain.deleteTag(tag.id), place)
}
</script>
