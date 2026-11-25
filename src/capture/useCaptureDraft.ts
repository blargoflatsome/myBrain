// SPEC §5 Quick capture: what I'm capturing, before it's saved. The Capture form binds to these fields; the rules for
// keeping my words when the type changes, starting the next one, and Speak it (with its Undo) live here, so they can be
// tested without a browser. Each kind's starting values come from its own blank draft, the same ones its editor opens with.
import { ref, toRaw, type Ref } from 'vue'
import { splitTitle, type Destination } from '@/capture/capture'
import { blankTask } from '@/tasks/actions'
import { DEFAULT_PRIORITY } from '@/tasks/rules'
import { blankQuest } from '@/quests/actions'
import { newHabit } from '@/habits/rules'
import { DEFAULT_POST_IT_COLOR } from '@/postits/rules'
import { plainText, textLines, toEditorHtml } from '@/journal/body'
import type { EnergyLevel, PostItColor, TimeBucket } from '@/sync/types'
import type { VoiceCommand } from '@/voice/parse'

/** Every type that has a title and notes (or details), so switching between them keeps both, formatting and all. */
const titled = (t: Destination) => t !== 'later' && t !== 'postit'

function blanks(timeZone: string) {
  const task = blankTask(null)
  const quest = blankQuest()
  const habit = newHabit('', '', timeZone)
  return {
    title: '',
    notes: '',
    dueDate: task.due_date ?? '',
    priority: task.priority ?? DEFAULT_PRIORITY,
    reminderTime: task.reminder_time ?? '',
    energy: quest.energy_level as EnergyLevel,
    time: quest.time_bucket as TimeBucket,
    newBucketName: null as string | null,
    rating: null as number | null,
    link: '',
    postBody: '',
    postColor: DEFAULT_POST_IT_COLOR as PostItColor,
    habitDays: habit.weekdays,
    habitInterval: habit.week_interval ?? 1,
    habitMonthly: habit.monthly ?? false,
    habitStart: habit.start_date,
    habitTime: habit.notify_time ?? '',
    habitTimer: habit.timer_minutes ?? null,
    habitPriority: habit.is_priority ?? false,
  }
}
type Blank = ReturnType<typeof blanks>
type Fields = { [K in keyof Blank]: Ref<Blank[K]> } & { type: Ref<Destination>; bucketId: Ref<string | null> }
type Snapshot = { [K in keyof Fields]: Fields[K]['value'] }

export function useCaptureDraft(timeZone: string) {
  const start = blanks(timeZone)
  const fields = {
    type: ref<Destination>('later'),
    bucketId: ref<string | null>(null),
    ...(Object.fromEntries(Object.entries(start).map(([k, v]) => [k, ref(v)])) as { [K in keyof Blank]: Ref<Blank[K]> }),
  } as Fields
  /** What was there before Speak it replaced it, for its Undo; null when there's nothing to put back. */
  const beforeHeard = ref<Snapshot | null>(null)
  /** Goes up whenever the Post It's text is replaced from outside its editor, so the editor starts again with it. */
  const version = ref(0)

  const f = fields
  const snapshot = () => Object.fromEntries(Object.entries(fields).map(([k, r]) => [k, structuredClone(toRaw(r.value))])) as Snapshot
  const restore = (s: Snapshot) => {
    for (const k of Object.keys(s) as (keyof Fields)[]) (fields[k] as Ref<unknown>).value = s[k]
  }

  /** Everything typed so far as plain lines, whatever the type. */
  function typedText(): string {
    if (f.type.value === 'postit') return textLines(f.postBody.value)
    return [f.title.value.trim(), f.notes.value ? textLines(f.notes.value) : ''].filter(Boolean).join('\n')
  }

  /** Choose a type, keeping what I typed: the first line is the title and the rest the notes or details. */
  function choose(d: Destination) {
    if (d === f.type.value) return
    if (!titled(f.type.value) || !titled(d)) {
      const text = typedText()
      f.title.value = ''
      f.notes.value = ''
      f.postBody.value = ''
      if (d === 'postit') f.postBody.value = toEditorHtml(text)
      else if (d === 'later') f.title.value = text
      else {
        const { title, rest } = splitTitle(text)
        f.title.value = title
        f.notes.value = rest
      }
    }
    f.type.value = d
    beforeHeard.value = null
  }

  /** Start the next one: every field back to its kind's default. The type and bucket stay, to add several in a row. */
  function clear() {
    const fresh = blanks(timeZone)
    for (const k of Object.keys(fresh) as (keyof Blank)[]) (fields[k] as Ref<unknown>).value = structuredClone(fresh[k])
    beforeHeard.value = null
    version.value++
  }

  /** Replace the form with what was heard; anything not said keeps its default. Undo comes back if I'd typed anything. */
  function heard(c: VoiceCommand) {
    const had = !!(f.title.value.trim() || plainText(f.notes.value) || plainText(f.postBody.value))
    const before = had ? snapshot() : null
    clear()
    f.type.value = c.destination
    if (c.destination === 'postit') f.postBody.value = toEditorHtml(c.title)
    else f.title.value = c.title
    if (c.dueDate) f.dueDate.value = c.dueDate
    if (c.priority) f.priority.value = c.priority
    if (c.reminderTime) f.reminderTime.value = c.reminderTime
    if (c.notifyTime) f.habitTime.value = c.notifyTime
    if (c.bucketId) f.bucketId.value = c.bucketId
    beforeHeard.value = before
  }

  /** Put back what Speak it replaced. */
  function undoHeard() {
    if (!beforeHeard.value) return
    restore(beforeHeard.value)
    beforeHeard.value = null
    version.value++
  }

  return { ...fields, beforeHeard, version, choose, clear, heard, undoHeard, today: start.habitStart }
}
