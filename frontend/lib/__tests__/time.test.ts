import { describe, it, expect } from 'vitest'
import { formatListTime, formatBubbleTime, dayLabel, isSameDay } from '../time'

const T = new Date('2026-03-10T14:05:00Z').getTime()

it('formats bubble time as HH:MM', () => {
  expect(formatBubbleTime(T)).toMatch(/^\d{2}:\d{2}$/)
})
it('labels today and yesterday', () => {
  expect(dayLabel(T, T)).toBe('Today')
  expect(dayLabel(T - 86_400_000, T)).toBe('Yesterday')
})
it('list time shows clock today, word yesterday, date older', () => {
  expect(formatListTime(T, T)).toMatch(/^\d{2}:\d{2}$/)
  expect(formatListTime(T - 86_400_000, T)).toBe('Yesterday')
  expect(formatListTime(T - 200 * 86_400_000, T)).toContain('202')
})
it('isSameDay compares calendar days', () => {
  expect(isSameDay(T, T + 3_600_000)).toBe(true)
  expect(isSameDay(T, T + 86_400_000)).toBe(false)
})
