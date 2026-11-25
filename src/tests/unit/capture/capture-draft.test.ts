import { describe, expect, it } from 'vitest'
import { isRef, toRaw, type Ref } from 'vue'
import { useCaptureDraft } from '@/capture/useCaptureDraft'
import { blankQuest } from '@/quests/actions'
import { blankTask } from '@/tasks/actions'
import { textLines } from '@/journal/body'
import type { VoiceCommand } from '@/voice/parse'

const TZ = 'America/New_York'

type Draft = ReturnType<typeof useCaptureDraft>
/** Every field of the form, by name (not the Undo copy or the editor's counter). */
const fields = (d: Draft) =>
  Object.fromEntries(Object.entries(d).filter(([k, v]) => isRef(v) && k !== 'beforeHeard' && k !== 'version').map(([k, v]) => [k, structuredClone(toRaw((v as Ref).value))]))

describe('SPEC §5 Quick capture: choosing a type keeps what I typed', () => {
  it('the first line becomes the title and the rest the notes, and back again', () => {
    const d = useCaptureDraft(TZ)
    d.title.value = 'Call the vet\nAsk about the shots\nAnd the bill'
    d.choose('task')
    expect(d.title.value).toBe('Call the vet')
    expect(textLines(d.notes.value)).toBe('Ask about the shots\nAnd the bill')
    d.choose('postit')
    expect(textLines(d.postBody.value)).toBe('Call the vet\nAsk about the shots\nAnd the bill')
    expect(d.title.value).toBe('')
    d.choose('later')
    expect(d.title.value).toBe('Call the vet\nAsk about the shots\nAnd the bill')
  })

  it('between two types with a title and notes, both stay as they are, formatting and all', () => {
    const d = useCaptureDraft(TZ)
    d.choose('task')
    d.title.value = 'Plan the trip'
    d.notes.value = '<p><strong>Book</strong> the train</p>'
    d.choose('quest')
    expect(d.title.value).toBe('Plan the trip')
    expect(d.notes.value).toBe('<p><strong>Book</strong> the train</p>')
  })
})

describe('SPEC §5 Quick capture: the next one starts with each kind’s defaults', () => {
  it('after a save every field is back to its default; the type and bucket stay', () => {
    const d = useCaptureDraft(TZ)
    const start = fields(d)
    d.choose('habit')
    d.bucketId.value = 'films'
    d.title.value = 'Stretch'
    d.priority.value = 3
    d.energy.value = 'fun'
    d.habitDays.value = [1]
    d.habitTimer.value = 10
    d.postColor.value = 'pink'

    d.clear()

    expect(fields(d)).toEqual({ ...start, type: 'habit', bucketId: 'films' })
    // The defaults are the ones each kind's own editor opens with.
    expect(d.priority.value).toBe(blankTask(null).priority)
    expect(d.energy.value).toBe(blankQuest().energy_level)
    expect(d.time.value).toBe(blankQuest().time_bucket)
  })
})

describe('SPEC §5 Speak it fills the form', () => {
  const said: VoiceCommand = { destination: 'task', title: 'Buy milk', dueDate: '2026-11-26', priority: 3, reminderTime: '09:00' }

  it('replaces what I typed, and Undo puts all of it back', () => {
    const d = useCaptureDraft(TZ)
    d.choose('vault')
    d.bucketId.value = 'films'
    d.title.value = 'Dune'
    d.rating.value = 4
    const typed = fields(d)

    d.heard(said)
    expect(d).toMatchObject({ type: { value: 'task' }, title: { value: 'Buy milk' }, dueDate: { value: '2026-11-26' }, priority: { value: 3 }, reminderTime: { value: '09:00' }, rating: { value: null } })
    d.heard({ destination: 'vault', title: 'Arrival', bucketId: 'books' })
    expect(d.bucketId.value).toBe('books')

    d.undoHeard()
    expect(fields(d)).toEqual({ ...typed, type: 'task', title: 'Buy milk', dueDate: '2026-11-26', priority: 3, reminderTime: '09:00', rating: null })
    expect(d.beforeHeard.value).toBeNull()
  })

  it('offers no Undo when nothing was typed', () => {
    const d = useCaptureDraft(TZ)
    d.heard(said)
    expect(d.beforeHeard.value).toBeNull()
  })
})
