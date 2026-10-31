// SPDX-License-Identifier: MIT
/**
 * Host half of the mcstat panel.
 *
 * Registers the `/mcstat` HTTP surface (snapshot, live log stream, server control,
 * settings) and, when the profile has a tool registry, one `mcstat_server` tool
 * that drives the very same operations from the conversation.
 */
import { handleRequest } from './lib/routes.js'
import { MCSTAT_TOOL } from './lib/tool.js'

export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/mcstat', handler: handleRequest }),
    'mcstat: http surface',
  )

  const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
  if (tools !== undefined && tools !== null && typeof tools.register === 'function') {
    ctx.effect(() => {
      try {
        return tools.register(MCSTAT_TOOL)
      } catch (error) {
        // A rejected tool definition must not take the panel down with it.
        console.error('[mcstat] tool registration failed:', error)
        return () => {}
      }
    }, 'mcstat: agent tool')
  }
}
