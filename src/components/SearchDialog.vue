<template>
  <dialog
    ref="dialog"
    :aria-label="m.windowLabel"
    class="m-0 h-dvh max-h-none w-full max-w-none bg-bg p-0 text-ink backdrop:bg-black/50 md:mx-auto md:mt-[8dvh] md:h-auto md:max-h-[80dvh] md:max-w-xl md:rounded-2xl md:border md:border-line"
    data-testid="search-dialog"
    @close="store.close()"
  >
    <div class="flex h-full flex-col">
      <div class="flex items-center gap-2 border-b border-line p-3 pr-14">
        <input
          ref="box"
          v-model="query"
          type="search"
          enterkeyhint="search"
          class="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink"
          :aria-label="m.placeholder"
          :placeholder="m.placeholder"
        >
      </div>

      <div v-if="tags.length" class="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2" role="group" :aria-label="m.tagsLabel">
        <button
          v-for="t in tags"
          :key="t.id"
          type="button"
          class="min-h-9 shrink-0 rounded-full border px-3 text-sm"
          :class="chosenTags.includes(t.id) ? 'choice-on border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink'"
          :aria-pressed="chosenTags.includes(t.id)"
          @click="toggleTag(t.id)"
        >
          #{{ t.name }}
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-3 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p v-if="!searching" class="text-sm text-muted">{{ m.hint }}</p>
        <p v-else-if="!results.length" class="text-muted" role="status">{{ m.noResults }}</p>
        <section v-for="g in groups" :key="g.type" class="mb-4 flex flex-col gap-1" :data-testid="`results-${g.type}`">
          <h2 class="px-1 text-xs font-semibold tracking-wide text-muted uppercase">{{ m.types[g.type] }}</h2>
          <button
            v-for="r in g.items"
            :key="r.id"
            type="button"
            class="flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-surface"
            data-testid="search-result"
            @click="openResult(r)"
          >
            <span class="flex w-full items-baseline justify-between gap-2">
              <span class="font-medium">{{ titleOf(r) }}</span>
              <span class="shrink-0 text-xs text-muted">{{ contextOf(r) }}</span>
            </span>
            <span v-if="snippet(r, query)" class="line-clamp-2 text-sm text-muted">{{ snippet(r, query) }}</span>
          </button>
        </section>
      </div>
    </div>
    <CloseX :label="m.close" @click="store.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Global search and tags: search tasks, journal, The Vault, quests and events on this device; filter by tag;
// tap a result to open it where it lives.
import CloseX from '@/components/CloseX.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useBrainStore } from '@/stores/brain'
import { useSearchStore } from '@/stores/search'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { RESULT_ORDER, type SearchDoc, type SearchType, search, searchDocs, snippet } from '@/search/search'
import { messages } from '@/messages'
import type { TagRow } from '@/sync/types'
import { dayLabel, shortDayWithYear } from '@/ui/dates'
import { live } from '@/sync/live'

const brain = useBrainStore()
const store = useSearchStore()
const route = useRoute()
const router = useRouter()
const m = messages.search

const dialog = ref<HTMLDialogElement | null>(null)
const box = ref<HTMLInputElement | null>(null)
const query = ref('')
const chosenTags = ref<string[]>([])

const docs = useLiveQuery<SearchDoc[]>(
  async () => {
    const db = brain.db
    if (!db) return []
    return searchDocs({
      tasks: await db.tasks.toArray(),
      vaultItems: await db.vault_items.toArray(),
      buckets: await db.vault_buckets.toArray(),
      journal: await db.journal_entries.toArray(),
      quests: await db.quests.toArray(),
      events: await db.events.toArray(),
      habits: await db.habits.toArray(),
      routines: await db.routines.toArray(),
      itemTags: await db.item_tags.toArray(),
    })
  },
  [],
  [() => brain.db],
)
const tags = useLiveQuery<TagRow[]>(
  async () => (brain.db ? live(await brain.db.tags.toArray()).sort((a, b) => a.name.localeCompare(b.name)) : []),
  [],
  [() => brain.db],
)

const results = computed(() => search(docs.value, query.value, chosenTags.value))
const groups = computed(() =>
  RESULT_ORDER.map((type) => ({ type, items: results.value.filter((r) => r.type === type).slice(0, 30) })).filter((g) => g.items.length),
)
const searching = computed(() => !!query.value.trim() || chosenTags.value.length > 0)

function toggleTag(id: string) {
  chosenTags.value = chosenTags.value.includes(id) ? chosenTags.value.filter((t) => t !== id) : [...chosenTags.value, id]
}

watch(
  () => store.isOpen,
  async (open) => {
    await nextTick()
    if (open && !dialog.value?.open) {
      dialog.value?.showModal()
      box.value?.focus()
      box.value?.select()
    }
    if (!open && dialog.value?.open) dialog.value.close()
  },
)
watch(() => route.fullPath, () => store.close())
function titleOf(doc: SearchDoc) {
  return doc.type === 'journal_entry' ? shortDayWithYear(doc.title) : doc.title
}
function contextOf(doc: SearchDoc) {
  if (doc.type === 'vault_item') return doc.context ?? ''
  if ((doc.type === 'task' || doc.type === 'event') && doc.date) return dayLabel(doc.date)
  return ''
}

const targets: Record<SearchType, (d: SearchDoc) => RouteLocationRaw> = {
  task: (d) => ({ name: 'home', query: { task: d.id } }),
  habit: (d) => ({ name: 'habits', query: { habit: d.id } }),
  routine: (d) => ({ name: 'routines', query: { routine: d.id } }),
  event: (d) => ({ name: 'calendar', query: { date: d.date ?? undefined, event: d.id } }),
  journal_entry: (d) => ({ name: 'journal', query: { date: d.date ?? undefined } }),
  vault_item: (d) => ({ name: 'vault', query: { bucket: d.bucketId, item: d.id } }),
  quest: (d) => ({ name: 'quests', query: { quest: d.id } }),
}
async function openResult(doc: SearchDoc) {
  store.close()
  await router.push(targets[doc.type](doc))
}
</script>
