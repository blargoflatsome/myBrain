// Links that open one item (SPEC §5 Global search, alerts, Up next, the Dashboard): built here, and read here by the
// page that opens them. Links built by the server (alerts and pushes, in SQL) use the same formats:
// /calendar?event=<id>, /calendar?date=<day>, /vault?bucket=<id>.
import { watch, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQuery, type RouteLocationRaw } from 'vue-router'

/** The item a link opens. */
export type ItemLink =
  | { kind: 'task' | 'habit' | 'routine' | 'quest'; id: string }
  | { kind: 'event'; id: string; date?: string | null }
  | { kind: 'vault_item'; id: string; bucket: string }
  | { kind: 'bucket'; bucket: string }
  | { kind: 'journal'; date: string }
  | { kind: 'day'; date: string }

/** Kinds opened by an id in the link, and the page and query field each one uses. */
const BY_ID = {
  task: { page: 'tasks', field: 'task' },
  habit: { page: 'habits', field: 'habit' },
  routine: { page: 'routines', field: 'routine' },
  quest: { page: 'quests', field: 'quest' },
  event: { page: 'calendar', field: 'event' },
  vault_item: { page: 'vault', field: 'item' },
} as const
export type LinkedKind = keyof typeof BY_ID

/** The link that opens this item. */
export function linkTo(link: ItemLink): RouteLocationRaw {
  switch (link.kind) {
    case 'event':
      return { name: 'calendar', query: { date: link.date ?? undefined, event: link.id } }
    case 'vault_item':
      return { name: 'vault', query: { bucket: link.bucket, item: link.id } }
    case 'bucket':
      return { name: 'vault', query: { bucket: link.bucket } }
    case 'journal':
      return { name: 'journal', query: { date: link.date } }
    case 'day':
      return { name: 'calendar', query: { date: link.date } }
    default:
      return { name: BY_ID[link.kind].page, query: { [BY_ID[link.kind].field]: link.id } }
  }
}

/** The id of the item of this kind that a link names, if it names one. */
export function linkedId(kind: LinkedKind, query: LocationQuery): string | null {
  const id = query[BY_ID[kind].field]
  return typeof id === 'string' && id ? id : null
}

/**
 * On a page: open the item a link names once its row is here (rows arrive after the page opens), then take the item
 * off the link, so going back or a reload doesn't open it again. `keep` is what stays on the link (Vault: the bucket).
 */
export function useOpenLinked<T extends { id: string; deleted_at?: string | null }>(
  kind: LinkedKind,
  rows: Ref<readonly T[]>,
  open: (row: T) => void,
  keep: (query: LocationQuery) => LocationQuery = () => ({}),
) {
  const route = useRoute()
  const router = useRouter()
  watch(
    [() => linkedId(kind, route.query), rows],
    ([id]) => {
      const row = id ? rows.value.find((r) => r.id === id && !r.deleted_at) : undefined
      if (!row) return
      open(row)
      void router.replace({ query: keep(route.query) })
    },
    { immediate: true },
  )
}
