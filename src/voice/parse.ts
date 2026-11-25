// SPEC §5 Quick capture, Speak it fills the form: turns what I said into a filled Capture form. Spoken words only,
// never typed ones (Type it like you'd say it stays dropped). Pure: no Vue, no database. It brings the date library,
// so Capture loads it only once something has been heard.
import type { Destination } from '@/capture/capture'
import { findDate } from '@/time/parseDate'
import { HIGH } from '@/tasks/rules'

/** A bucket I can capture to, in the order they're listed (my default first). */
export interface VoiceBucket {
  id: string
  name: string
  /** Mine, not shared with me: mine win a name tie. */
  mine: boolean
}

/** What the form should show. Fields left out keep the form's own defaults. */
export interface VoiceCommand {
  destination: Destination
  /** The title, or the whole note for a Post It. Empty when only a type was said. */
  title: string
  dueDate?: string
  priority?: number
  /** A High task with a date: its Reminder time ("HH:MM"). */
  reminderTime?: string
  /** A habit: its reminder time ("HH:MM"). */
  notifyTime?: string
  bucketId?: string
}

export interface VoiceContext {
  /** "YYYY-MM-DD" in the device's time zone. */
  today: string
  buckets: VoiceBucket[]
}

const TYPE = String.raw`(task|quest|habit|post ?-?it|vault item)`
const PRIORITY = String.raw`(?:with\s+)?(?:(low|medium|high)\s+priority|priority\s+(low|medium|high))`
const LEVELS: Record<string, number> = { low: 1, medium: 2, high: 3 }

// The words that name each type after "to my …" / "as a …". Type words beat a bucket of the same name.
const TYPE_WORDS: [Destination, RegExp][] = [
  ['task', /^(?:tasks?|task list|to ?-?do(?: list)?|to ?-?dos)$/],
  ['quest', /^(?:quests?|quest list)$/],
  ['habit', /^habits?$/],
  ['postit', /^post ?-?its?$/],
  ['vault', /^(?:vault|vault items?)$/],
  ['later', /^(?:orphans?|decide later)$/],
]
const typeWord = (words: string): Destination | null => TYPE_WORDS.find(([, re]) => re.test(words.toLowerCase()))?.[0] ?? null

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** The sentence with the words at [index, index + length) taken out. */
const cut = (s: string, index: number, length: number) => tidy(`${s.slice(0, index)} ${s.slice(index + length)}`)

/** Lower case, no "my" or "the" in front, no plural s, so "my shopping lists" finds "Shopping list". */
const bucketKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/^(?:my|the)\s+/, '')
    .trim()
    .replace(/s$/, '')

function findBucket(said: string, buckets: VoiceBucket[]): VoiceBucket | null {
  const matches = buckets.filter((b) => bucketKey(b.name) === bucketKey(said))
  return matches.find((b) => b.mine) ?? matches[0] ?? null
}

/** "at 5 p.m." / "5:30pm": the time as "HH:MM", and where the words are. */
function findTime(text: string): { time: string; index: number; length: number } | null {
  const m = /(?:^|\s)((?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?)/i.exec(text)
  if (!m) return null
  const hour = Number(m[2])
  const minute = Number(m[3] ?? 0)
  if (hour < 1 || hour > 12 || minute > 59) return null
  const h24 = (hour % 12) + (m[4]!.toLowerCase() === 'p' ? 12 : 0)
  return { time: `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, index: m.index + m[0].indexOf(m[1]!), length: m[1]!.length }
}

/** "high priority" / "priority high" / "with high priority" anywhere: the level, and the sentence without it. */
function findPriority(text: string): { priority: number; rest: string } | null {
  const m = new RegExp(String.raw`(?:^|\s)${PRIORITY}(?=\s|$)`, 'i').exec(text)
  if (!m) return null
  return { priority: LEVELS[(m[1] ?? m[2])!.toLowerCase()]!, rest: cut(text, m.index, m[0].length) }
}

// Stands in for a time while the date is found, so "tomorrow at 5pm" loses only "tomorrow".
const HELD = ''

/** The form for a type and the words for it: dates and times go to fields that exist, the rest is the title. */
function build(destination: Destination, words: string, ctx: VoiceContext, priority?: number): VoiceCommand {
  let text = tidy(words)
  const command: VoiceCommand = { destination, title: '' }
  if (destination === 'task') {
    const p = findPriority(text)
    if (p) text = p.rest
    priority ??= p?.priority
    if (priority) command.priority = priority
    const time = findTime(text)
    const timeWords = time ? text.slice(time.index, time.index + time.length) : ''
    const held = time ? `${text.slice(0, time.index)}${HELD}${text.slice(time.index + time.length)}` : text
    const date = findDate(held, ctx.today)
    if (date) {
      command.dueDate = date.date
      // A time fills the Reminder time only on a High task with a date; otherwise it stays in the title.
      const useTime = !!time && priority === HIGH
      if (useTime) command.reminderTime = time.time
      text = tidy(date.rest.replace(HELD, useTime ? '' : timeWords))
    }
  }
  if (destination === 'habit') {
    const time = findTime(text)
    if (time) {
      command.notifyTime = time.time
      text = cut(text, time.index, time.length)
    }
  }
  command.title = capitalise(text)
  return command
}

/** "milk" to a bucket; with no bucket named, the usual one (my default, or the first listed). */
function vault(what: string, bucketId: string | undefined): VoiceCommand {
  return { destination: 'vault', title: capitalise(tidy(what)), ...(bucketId ? { bucketId } : {}) }
}

/**
 * What I said, as a filled Capture form, or null when it isn't a command I know (the words then just go in the text
 * box, with the chosen type kept). Nothing heard is ever dropped: whatever isn't placed in a field stays in the title.
 */
export function parseVoice(heard: string, ctx: VoiceContext): VoiceCommand | null {
  const said = tidy(heard).replace(/[.!?]+$/, '')
  if (!said) return null
  const usual = ctx.buckets[0]?.id

  // Just a type: the form opens on it with an empty title.
  const onlyType = new RegExp(String.raw`^(?:(?:add\s+)?(?:an?\s+)?new\s+)?${TYPE}$`, 'i').exec(said)
  if (onlyType || /^add (?:it )?to (?:my |the )?vault$/i.test(said)) {
    const d = onlyType ? typeWord(onlyType[1]!)! : 'vault'
    return d === 'vault' ? vault('', usual) : { destination: d, title: '' }
  }

  // "remember …" is a task: "remember to call mom tomorrow" → Call mom, tomorrow.
  const remember = /^remember\s+(?:to\s+)?(.+)$/i.exec(said)
  if (remember) return build('task', remember[1]!, ctx)

  // "add a habit …", "add a post it …": the type first, the rest is the item.
  const typeFirst = new RegExp(String.raw`^(?:add|new)\s+(?:an?\s+)?(?:new\s+)?${TYPE}\s+(.+)$`, 'i').exec(said)
  if (typeFirst) {
    const d = typeWord(typeFirst[1]!)!
    return d === 'vault' ? vault(typeFirst[2]!, usual) : build(d, typeFirst[2]!, ctx)
  }

  const add = /^add\s+(.+)$/i.exec(said)
  if (!add) return null
  let body = add[1]!

  // A priority after the destination ("… to tasks high priority") comes off first, so the destination is at the end.
  let priority: number | undefined
  const trailing = new RegExp(String.raw`\s+${PRIORITY}$`, 'i').exec(body)
  if (trailing) {
    priority = LEVELS[(trailing[1] ?? trailing[2])!.toLowerCase()]
    body = body.slice(0, trailing.index)
  }

  // "… as a quest"
  const asType = new RegExp(String.raw`^(.+)\s+as\s+(?:an?\s+)?${TYPE}$`, 'i').exec(body)
  if (asType) {
    const d = typeWord(asType[2]!)!
    return d === 'vault' ? vault(asType[1]!, usual) : build(d, asType[1]!, ctx, d === 'task' ? priority : undefined)
  }

  // "… to my tasks" / "… to my shopping list": only the last "to" counts, so "talk to mom to my tasks" keeps "talk to
  // mom". Words after a type ("to my tasks tomorrow") still belong to the item.
  const to = /^(.+)\s+(?:to|in|into|on)\s+(?:my\s+|the\s+)?(.+)$/i.exec(body)
  if (!to) return null
  const what = to[1]!
  const where = to[2]!
  const parts = where.split(' ')
  for (let n = Math.min(parts.length, 3); n > 0; n--) {
    const d = typeWord(parts.slice(0, n).join(' '))
    if (!d) continue
    const words = tidy(`${what} ${parts.slice(n).join(' ')}`)
    return d === 'vault' ? vault(words, usual) : build(d, words, ctx, d === 'task' ? priority : undefined)
  }
  const bucket = findBucket(where, ctx.buckets)
  // A bucket that doesn't exist: not a command, so the whole sentence goes in the text box.
  return bucket ? vault(what, bucket.id) : null
}
