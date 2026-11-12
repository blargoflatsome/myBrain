<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
    <p v-if="uses.length" class="text-sm text-muted">{{ m.intro }}</p>
    <p v-else class="text-muted">{{ m.empty }}</p>
    <ul class="flex flex-col gap-2">
      <li v-for="u in uses" :key="u.tag.id" class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3" data-testid="tag-row">
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
    </ul>
    <TagEditor :tag="editing" :tags="uses.map((u) => u.tag)" @rename="rename" @merge="merge" @delete="remove" @close="editing = null" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Tags page: every tag A to Z with what it's on; tap one to search by it; rename, merge or delete in the
// tag's window. Each change happens straight away with Undo (SPEC §2 Calm by design).
import { ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import TagEditor from '@/tags/components/TagEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useSearchStore } from '@/stores/search'
import { useUndoStore } from '@/stores/undo'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { cleanTagName, tagUsage, type TagUse } from '@/tags/rules'
import { live } from '@/sync/live'
import { messages } from '@/messages'
import type { TagRow } from '@/sync/types'
import { rowAction } from '@/ui/styles'

const brain = useBrainStore()
const search = useSearchStore()
const undo = useUndoStore()
const m = messages.tagsPage
const editing = ref<TagRow | null>(null)

const uses = useLiveQuery<TagUse[]>(
  async () => {
    const db = brain.db
    if (!db) return []
    const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))
    return tagUsage(await db.tags.toArray(), await db.item_tags.toArray(), {
      task: ids(live(await db.tasks.toArray())),
      habit: ids(live(await db.habits.toArray())),
      routine: ids(live(await db.routines.toArray())),
    })
  },
  [],
  [() => brain.db],
)

/** Returns the tag a new name clashes with, so the window can offer to merge. */
async function rename(tag: TagRow, name: string, done: (clash: TagRow | null) => void) {
  const result = await brain.renameTag(tag, name)
  if (result && 'clash' in result) return done(result.clash)
  done(null)
  editing.value = null
  if (result) undo.offer(m.renamed(tag.name, cleanTagName(name)), result.undo)
}
async function merge(from: TagRow, into: TagRow) {
  editing.value = null
  undo.offer(m.merged(from.name, into.name), await brain.mergeTags(from.id, into.id))
}
async function remove(tag: TagRow) {
  editing.value = null
  undo.offer(m.deleted(tag.name), await brain.deleteTag(tag.id))
}
</script>
