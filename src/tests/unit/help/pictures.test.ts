// SPEC §5 Home page and Help: every topic and feature has its picture (made by `npm run docs:images`).
import { describe, expect, it } from 'vitest'
import { messages } from '@/messages'

const pictures = Object.keys(import.meta.glob('/public/help/*.webp')).map((p) => p.replace('/public/help/', '').replace('.webp', ''))

describe('SPEC §5 Home page and Help: pictures', () => {
  it('every Help topic and home page feature has its picture in public/help', () => {
    const wanted = [...messages.help.topics.map((t) => `help-${t.id}`), ...messages.home.features.map((f) => f.image)]
    expect(wanted.filter((name) => !pictures.includes(name))).toEqual([])
  })
})
