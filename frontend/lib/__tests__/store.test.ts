import { describe, it, expect } from 'vitest'
import { useAppStore } from '../store'

it('pushToast appends and clears', () => {
  useAppStore.getState().pushToast('hello')
  expect(useAppStore.getState().toasts.length).toBe(1)
  useAppStore.getState().dismissToast(useAppStore.getState().toasts[0].id)
  expect(useAppStore.getState().toasts.length).toBe(0)
})
