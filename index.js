// SPDX-License-Identifier: MIT
/**
 * Host half of the mcstat panel.
 *
 * Resolves its settings (bundle config, environment, then autodetection), then
 * registers the `/mcstat` HTTP surface — snapshot, live log stream, server
 * control, settings, and DS-assisted checks — plus one `mcstat_server` tool that
 * drives the very same operations from the conversation.
 */
import { loadAiSettings } from './lib/ai.js'
import { createHandler } from './lib/routes.js'
import { resolveSettings } from './lib/system.js'
import { createTool } from './lib/tool.js'

export const inject = ['webServer']

export async function apply(ctx, config) {
  await resolveSettings(config).catch(() => {})
  await loadAiSettings().catch(() => {})

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/mcstat', handler: createHandler(ctx) }),
    'mcstat: http surface',
  )

  const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
  if (tools !== undefined && tools !== null && typeof tools.register === 'function') {
    ctx.effect(() => {
      try {
        return tools.register(createTool(ctx))
      } catch (error) {
        // A rejected tool definition must not take the panel down with it.
        console.error('[mcstat] tool registration failed:', error)
        return () => {}
      }
    }, 'mcstat: agent tool')
  }
}
