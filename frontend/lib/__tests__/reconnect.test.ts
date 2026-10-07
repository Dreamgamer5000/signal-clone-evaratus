import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppStore } from '../store'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners: Record<string, (e: { data: string }) => void> = {}
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(t: string, fn: (e: { data: string }) => void) {
    this.listeners[t] = fn
  }
  close() {}
  emit(t: string, data: unknown) {
    this.listeners[t]?.({ data: JSON.stringify(data) })
  }
}

beforeEach(() => {
  FakeEventSource.instances = []
})

it('onOpen bump makes the chat refetch (sseEpoch increments)', async () => {
  vi.stubGlobal('EventSource', FakeEventSource)
  const { connectSSE } = await import('../sse')
  const before = useAppStore.getState().sseEpoch
  const stop = connectSSE({
    onMessageNew: () => {},
    onMessageStatus: () => {},
    onTyping: () => {},
    onPresence: () => {},
    onConversationUpdated: () => {},
    onOpen: () => useAppStore.getState().bumpSseEpoch(),
  })
  FakeEventSource.instances[0].onopen?.()
  expect(useAppStore.getState().sseEpoch).toBe(before + 1)
  stop()
})

it('reconnect creates a fresh EventSource after error', async () => {
  vi.stubGlobal('EventSource', FakeEventSource)
  const { connectSSE } = await import('../sse')
  const stop = connectSSE({
    onMessageNew: () => {},
    onMessageStatus: () => {},
    onTyping: () => {},
    onPresence: () => {},
    onConversationUpdated: () => {},
    onOpen: () => {},
  })
  FakeEventSource.instances[0].onerror?.()
  await new Promise((r) => setTimeout(r, 30))
  expect(FakeEventSource.instances.length).toBe(2)
  stop()
})
