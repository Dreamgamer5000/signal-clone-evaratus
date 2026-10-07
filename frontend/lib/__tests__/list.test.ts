import { describe, it, expect } from 'vitest'
import { sortConversations, filterConversations } from '../list'

const mk = (id: number, last: number, pinned = false) =>
  ({ conversation_id: id, is_pinned: pinned, last_message: { created_at: last } }) as any

it('pins first, then newest first', () => {
  const out = sortConversations([mk(1, 10), mk(2, 30, true), mk(3, 20)])
  expect(out.map((c) => c.conversation_id)).toEqual([2, 3, 1])
})
it('filters by query against title or peer name', () => {
  const items = [
    { conversation_id: 1, title: 'Team', peer: null, last_message: null },
    { conversation_id: 2, title: null, peer: { display_name: 'Bob Smith' }, last_message: null },
  ] as any
  expect(filterConversations(items, 'bo').map((c) => c.conversation_id)).toEqual([2])
  expect(filterConversations(items, 'team').map((c) => c.conversation_id)).toEqual([1])
})
