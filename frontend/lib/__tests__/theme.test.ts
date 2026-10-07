import { describe, it, expect } from 'vitest'
import { resolveTheme, applyTheme } from '../theme'

it('resolves theme from setting and system preference', () => {
  expect(resolveTheme('dark', false)).toBe('dark')
  expect(resolveTheme('light', true)).toBe('light')
  expect(resolveTheme('system', true)).toBe('dark')
  expect(resolveTheme('system', false)).toBe('light')
})

it('applyTheme sets the html data attribute', () => {
  const el = { dataset: {} } as HTMLElement
  ;(globalThis as any).document = { documentElement: el }
  applyTheme('dark')
  expect(el.dataset.theme).toBe('dark')
  applyTheme('light')
  expect(el.dataset.theme).toBe('light')
})
