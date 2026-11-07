import { describe, expect, it } from 'vitest'
import { formatTime, nearestQuarter, parseTime, QUARTER_HOURS } from './parse'

describe('Spec §5 Time fields: typing a time', () => {
  it.each([
    ['8', '08:00'],
    ['830', '08:30'],
    ['8:30', '08:30'],
    ['8:30 pm', '20:30'],
    ['8:30PM', '20:30'],
    ['6p', '18:00'],
    ['6 p.m.', '18:00'],
    ['12am', '00:00'],
    ['12 pm', '12:00'],
    ['1230', '12:30'],
    ['18:00', '18:00'],
    ['0745', '07:45'],
    ['08:00', '08:00'],
  ])('"%s" is %s', (typed, expected) => {
    expect(parseTime(typed)).toBe(expected)
  })

  it.each(['', 'abc', '25', '13pm', '8:75', '0am', '12345'])('"%s" is not a time', (typed) => {
    expect(parseTime(typed)).toBeNull()
  })

  it('shows times the device way: 12-hour with am/pm, or 24-hour', () => {
    expect(formatTime('08:05', true)).toBe('8:05 am')
    expect(formatTime('00:30', true)).toBe('12:30 am')
    expect(formatTime('12:00', true)).toBe('12:00 pm')
    expect(formatTime('20:30:00', true)).toBe('8:30 pm')
    expect(formatTime('08:05', false)).toBe('08:05')
  })

  it('the list has every 15 minutes, and opens at the nearest one', () => {
    expect(QUARTER_HOURS).toHaveLength(96)
    expect(QUARTER_HOURS[0]).toBe('00:00')
    expect(QUARTER_HOURS.at(-1)).toBe('23:45')
    expect(nearestQuarter('08:07')).toBe('08:00')
    expect(nearestQuarter('08:08')).toBe('08:15')
    expect(nearestQuarter('23:55')).toBe('00:00')
    expect(nearestQuarter(null)).toBe('08:00')
  })
})
