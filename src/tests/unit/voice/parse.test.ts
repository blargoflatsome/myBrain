import { describe, expect, it } from 'vitest'
import { parseVoice, type VoiceBucket } from '@/voice/parse'

const TODAY = '2026-11-20' // a Friday
// As listed: my default (Groceries) first.
const BUCKETS: VoiceBucket[] = [
  { id: 'groceries', name: 'Groceries', mine: true },
  { id: 'shared-shopping', name: 'Shopping list', mine: false },
  { id: 'shopping', name: 'Shopping list', mine: true },
  { id: 'tasks-bucket', name: 'Tasks', mine: true },
]
const parse = (said: string, today = TODAY) => parseVoice(said, { today, buckets: BUCKETS })

describe('SPEC §5 Quick capture: Speak it fills the form', () => {
  it.each([
    ['new task', { destination: 'task', title: '' }],
    ['Add new task', { destination: 'task', title: '' }],
    ['task', { destination: 'task', title: '' }],
    ['new quest', { destination: 'quest', title: '' }],
    ['new habit', { destination: 'habit', title: '' }],
    ['new post it', { destination: 'postit', title: '' }],
    ['new vault item', { destination: 'vault', title: '', bucketId: 'groceries' }],
    ['add to the vault', { destination: 'vault', title: '', bucketId: 'groceries' }],
  ])('just a type: "%s"', (said, form) => {
    expect(parse(said)).toEqual(form)
  })

  it.each([
    ['add dentist appointment December 13th to tasks', { destination: 'task', title: 'Dentist appointment', dueDate: '2026-12-13' }],
    ['add call mom tomorrow to my tasks', { destination: 'task', title: 'Call mom', dueDate: '2026-11-21' }],
    ['add call mom to my tasks tomorrow', { destination: 'task', title: 'Call mom', dueDate: '2026-11-21' }],
    ['add pay rent to tasks high priority', { destination: 'task', title: 'Pay rent', priority: 3 }],
    ['add pay rent medium priority to my tasks', { destination: 'task', title: 'Pay rent', priority: 2 }],
    ['add talk to mom to my tasks', { destination: 'task', title: 'Talk to mom' }],
    ['remember to call mom tomorrow', { destination: 'task', title: 'Call mom', dueDate: '2026-11-21' }],
    ['Remember the milk.', { destination: 'task', title: 'The milk' }],
    ['add milk to my shopping list', { destination: 'vault', title: 'Milk', bucketId: 'shopping' }],
    ['add eggs to the shopping lists', { destination: 'vault', title: 'Eggs', bucketId: 'shopping' }],
    ['add milk to the vault', { destination: 'vault', title: 'Milk', bucketId: 'groceries' }],
    ['add learn the ukulele as a quest', { destination: 'quest', title: 'Learn the ukulele' }],
    ['add a habit stretch every morning', { destination: 'habit', title: 'Stretch every morning' }],
    ['add a post it buy stamps', { destination: 'postit', title: 'Buy stamps' }],
    ['add buy stamps to my post its', { destination: 'postit', title: 'Buy stamps' }],
    ['add sort the garage to orphans', { destination: 'later', title: 'Sort the garage' }],
  ])('a whole capture: "%s"', (said, form) => {
    expect(parse(said)).toEqual(form)
  })

  it('keeps the words as heard, only the first letter capitalised', () => {
    expect(parse('add call Mom about the iPhone to my tasks')?.title).toBe('Call Mom about the iPhone')
  })

  it('dates only fill tasks: on other types the words stay in the title', () => {
    expect(parse('add pick apples tomorrow as a quest')).toEqual({ destination: 'quest', title: 'Pick apples tomorrow' })
  })

  it('a day with no year means the next one coming', () => {
    expect(parse('add dentist December 13th to tasks', '2026-12-20')?.dueDate).toBe('2027-12-13')
    expect(parse('add dentist December 13th to tasks', '2027-01-05')?.dueDate).toBe('2027-12-13')
  })

  it.each([
    ['a High task with a date: the Reminder time', 'add pay rent tomorrow at 5pm to tasks high priority', { title: 'Pay rent', dueDate: '2026-11-21', priority: 3, reminderTime: '17:00' }],
    ['any other task: stays in the title', 'add call mom tomorrow at 5 p.m. to my tasks', { title: 'Call mom at 5 p.m.', dueDate: '2026-11-21' }],
    ['a task with no date: stays in the title', 'add call mom at 5pm to my tasks high priority', { title: 'Call mom at 5pm', priority: 3 }],
    ['a habit: its reminder time', 'add a habit stretch at 7:30am', { title: 'Stretch', notifyTime: '07:30' }],
  ])('a time fills a time field where there is one (%s)', (_rule, said, form) => {
    expect(parse(said)).toMatchObject(form)
    if (!('reminderTime' in form)) expect(parse(said)?.reminderTime).toBeUndefined()
  })

  it('a type word beats a bucket of the same name, and my own bucket wins a name tie with a shared one', () => {
    expect(parse('add milk to my tasks')?.destination).toBe('task')
    expect(parse('add milk to my shopping list')?.bucketId).toBe('shopping')
  })

  it.each(['add paint to my garage list', 'add go to the store', 'buy milk', 'call mom tomorrow'])(
    'what isn\'t a command I know gives nothing, so the words just fill the text box: "%s"',
    (said) => {
      expect(parse(said)).toBeNull()
    },
  )

  it('long speech is kept whole', () => {
    const long = 'call the insurance company about the claim from the storm last spring and ask whether the roof repair counts '.repeat(4).trim()
    expect(parse(`add ${long} to my tasks`)?.title).toBe(`C${long.slice(1)}`)
  })
})
