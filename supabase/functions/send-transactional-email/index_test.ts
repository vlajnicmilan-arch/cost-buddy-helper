/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { assert, assertStringIncludes } from 'jsr:@std/assert'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

// Security regression: the caller's templateData must NOT be able to
// override appBaseUrl. The function accepts any valid Bearer (including the
// public anon key), so a caller-supplied appBaseUrl would let anyone send
// a signed e-mail with links to their own domain.
//
// The test evaluates the ACTUAL `const renderData = ...` line from
// index.ts (extracted from source), then renders a real template with the
// result. Reverting the spread order makes this test fail.

async function readRenderDataLine(): Promise<string> {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  const match = src.match(/^\s*const renderData = \{[^}]*\}/m)
  assert(match, 'renderData composition not found in index.ts')
  return match[0]
}

Deno.test('caller-supplied appBaseUrl cannot override the app origin', async () => {
  const line = await readRenderDataLine()

  const getAppUrl = () => 'https://vmbalance.com'
  const templateData = {
    appBaseUrl: 'https://zlo.example', // malicious caller payload
    scheduledDate: '15.05.2026.',
    graceDays: 30,
  }

  // Evaluate the real composition line from the function source.
  const renderData = new Function('templateData', 'getAppUrl', `return (${line.replace(/^\s*const renderData = /, '')})`)(
    templateData,
    getAppUrl,
  ) as Record<string, unknown>

  const tpl = TEMPLATES['account-deletion-scheduled']
  assert(tpl, 'template account-deletion-scheduled not found')

  const html = await renderAsync(
    React.createElement(tpl.component, renderData as never),
  )

  assertStringIncludes(html, 'https://vmbalance.com')
  assert(!html.includes('zlo.example'), 'caller-supplied appBaseUrl leaked into the rendered e-mail')
})
