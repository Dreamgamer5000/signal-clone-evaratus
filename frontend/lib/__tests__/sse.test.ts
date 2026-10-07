import { describe, it, expect, vi, beforeEach } from 'vitest'

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

it('parses envelope and reconnects on error', async () => {
  vi.stubGlobal('EventSource', FakeEventSource)
  const { connectSSE } = await import('../sse')
  const seen: unknown[] = []
  const onOpen = vi.fn()
  const stop = connectSSE({
    onMessageNew: (p) => seen.push(p),
    onReaction: () => {},
    onMessageStatus: () => {},
    onTyping: () => {},
    onPresence: () => {},
    onConversationUpdated: () => {},
    onOpen,
  })
  const es = FakeEventSource.instances[0]
  es.onopen?.()
  es.emit('message.new', { type: 'message.new', payload: { body: 'x' } })
  expect(seen).toEqual([{ body: 'x' }])
  expect(onOpen).toHaveBeenCalledOnce()
  es.onerror?.()
  await new Promise((r) => setTimeout(r, 50))
  expect(FakeEventSource.instances.length).toBe(2)
  stop()
})
