import { useDeviceQuery } from '@/sync/useRows'
import { useBrainStore } from '@/stores/brain'
import { useAuthStore } from '@/stores/auth'
import { useCelebrateStore } from '@/stores/celebrate'
import { useToday } from '@/composables/useToday'
import { trophyBoard, type BoardItem } from '@/trophies/board'
import { trophyValues } from '@/trophies/rules'

/** Every trophy with its level and progress, kept up to date as my data changes (SPEC §5 Trophies). */
export function useTrophyBoard() {
  const brain = useBrainStore()
  const auth = useAuthStore()
  const celebrate = useCelebrateStore()
  const { today, timeZone } = useToday()
  return useDeviceQuery<{ items: BoardItem[] }>(
    async (db) => {
      const badges = await db.badges.toArray()
      const history = await brain.trophyHistory({ accountCreated: auth.user?.created_at ?? null, ...celebrate.counts })
      const values = trophyValues(history, new Date(), timeZone.value)
      return { items: trophyBoard(badges, values, timeZone.value) }
    },
    { items: [] },
    [today, () => celebrate.counts],
  )
}
