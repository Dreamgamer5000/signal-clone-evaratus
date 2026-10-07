import { describe, it, expect } from 'vitest'
import { matchShortcut, type ShortcutEvent } from '../shortcuts'

const ev = (partial: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: 'a',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...partial,
})

it('maps Cmd+K on mac and Ctrl+K elsewhere to search', () => {
  expect(matchShortcut(ev({ key: 'k', metaKey: true }), 'mac')).toBe('search')
  expect(matchShortcut(ev({ key: 'k', ctrlKey: true }), 'other')).toBe('search')
  // wrong modifier for the platform: no match
  expect(matchShortcut(ev({ key: 'k', ctrlKey: true }), 'mac')).toBeNull()
  expect(matchShortcut(ev({ key: 'k', metaKey: true }), 'other')).toBeNull()
})

it('maps escape, alt arrows, slash and question mark', () => {
  expect(matchShortcut(ev({ key: 'Escape' }), 'other')).toBe('close')
  expect(matchShortcut(ev({ key: 'ArrowDown', altKey: true }), 'other')).toBe('next-chat')
  expect(matchShortcut(ev({ key: 'ArrowUp', altKey: true }), 'other')).toBe('prev-chat')
  expect(matchShortcut(ev({ key: '/' }), 'other')).toBe('focus-composer')
  expect(matchShortcut(ev({ key: '?', shiftKey: true }), 'other')).toBe('show-help')
})

it('shift+enter is not a shortcut (newline handled by composer)', () => {
  expect(matchShortcut(ev({ key: 'Enter', shiftKey: true }), 'other')).toBeNull()
  expect(matchShortcut(ev({ key: 'Enter' }), 'other')).toBeNull()
})

it('plain letters do nothing', () => {
  expect(matchShortcut(ev({ key: 'a' }), 'other')).toBeNull()
  expect(matchShortcut(ev({ key: 'K' }), 'other')).toBeNull()
})
