import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  ensureUnsubscribeToken,
  getOrCreateUnsubscribeToken,
} from '../unsubscribeToken.ts'

// deno-lint-ignore no-explicit-any
function fakeSupabase(rows: Array<{ email: string; token: string }>) {
  const inserted: Array<{ email: string; token: string }> = []
  const client = {
    inserted,
    rows,
    from(_table: string) {
      let filterEmail = ''
      const builder = {
        select: (_c: string) => builder,
        eq: (_col: string, val: string) => {
          filterEmail = val
          return builder
        },
        maybeSingle: () => {
          const found = rows.find((r) => r.email === filterEmail)
          return Promise.resolve({ data: found ?? null, error: null })
        },
        insert: (row: { email: string; token: string }) => {
          inserted.push(row)
          rows.push(row)
          return Promise.resolve({ error: null })
        },
      }
      return builder
    },
  }
  return client
}

Deno.test('postojeći token se ponovno koristi', async () => {
  const sb = fakeSupabase([{ email: 'a@b.com', token: 'existing-token' }])
  const token = await getOrCreateUnsubscribeToken(sb, 'A@B.com')
  assertEquals(token, 'existing-token')
  assertEquals(sb.inserted.length, 0)
})

Deno.test('nepostojeći token se stvara i upisuje', async () => {
  const sb = fakeSupabase([])
  const token = await getOrCreateUnsubscribeToken(sb, 'new@user.com')
  assertEquals(typeof token, 'string')
  assertEquals(token.length, 32)
  assertEquals(sb.inserted.length, 1)
  assertEquals(sb.inserted[0].email, 'new@user.com')
  assertEquals(sb.inserted[0].token, token)
})

Deno.test('ensureUnsubscribeToken ne dira postojeći token u payloadu', async () => {
  const sb = fakeSupabase([])
  const token = await ensureUnsubscribeToken(sb, {
    to: 'x@y.com',
    unsubscribe_token: 'already-here',
  })
  assertEquals(token, 'already-here')
  assertEquals(sb.inserted.length, 0)
})

Deno.test('ensureUnsubscribeToken dodaje token kad ga payload nema', async () => {
  const sb = fakeSupabase([])
  const token = await ensureUnsubscribeToken(sb, { to: 'x@y.com' })
  assertEquals(sb.inserted.length, 1)
  assertEquals(sb.inserted[0].email, 'x@y.com')
  assertEquals(token, sb.inserted[0].token)
})
