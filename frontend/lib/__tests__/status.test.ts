import { describe, it, expect } from 'vitest'
import { tickState } from '../status'

it('maps derived status to tick glyphs', () => {
  expect(tickState({ status: 'sending' } as any, 1)).toBe('clock')
  expect(tickState({ status: 'sent' } as any, 1)).toBe('single')
  expect(tickState({ status: 'delivered' } as any, 1)).toBe('double')
  expect(tickState({ status: 'read' } as any, 1)).toBe('double-blue')
  expect(tickState({ status: 'read', sender_id: 2 } as any, 1)).toBeNull()
})
