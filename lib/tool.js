// SPDX-License-Identifier: MIT
/**
 * The agent-facing equivalent of the panel's buttons: one tool whose `action`
 * dispatches to the exact same functions the HTTP routes call.
 */
import { analyze } from './ai.js'
import { collectStats } from './collect.js'
import { serviceAction, updateConfig } from './actions.js'
import { runtime } from './system.js'

/** Tool argument name -> `server.properties` key. */
const CONFIG_FIELDS = {
  difficulty: 'difficulty',
  motd: 'motd',
  maxPlayers: 'max-players',
  pvp: 'pvp',
  whiteList: 'white-list',
  onlineMode: 'online-mode',
  viewDistance: 'view-distance',
  simulationDistance: 'simulation-distance',
}

/** Build the tool for one plugin instance; `ctx` reaches the profile's model. */
export function createTool(ctx) {
  return {
  name: 'mcstat_server',
  description:
    'Inspect or control the local Minecraft server shown by the mcstat panel. ' +
    'Use action "status" for a read-only summary (state, uptime, players, CPU, memory, world, backups, tunnel, tick warnings). ' +
    'Use "start", "stop", or "restart" to control the systemd user unit; stopping and restarting disconnect every player, so only do that when the user asks. ' +
    'Use "set_config" with one or more setting fields to change server.properties; when the server is running this stops it, writes the file, and starts it again. ' +
    'Use "diagnose" to have the configured model review the current status and recent warnings/errors (the same DS-assisted check the panel offers).',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'start', 'stop', 'restart', 'set_config', 'diagnose'],
        description: 'What to do.',
      },
      difficulty: {
        type: 'string',
        enum: ['peaceful', 'easy', 'normal', 'hard'],
        description: 'set_config: game difficulty.',
      },
      motd: { type: 'string', description: 'set_config: server list message, 1-200 characters.' },
      maxPlayers: { type: 'integer', description: 'set_config: player limit, 1-1000.' },
      pvp: { type: 'boolean', description: 'set_config: allow player versus player combat.' },
      whiteList: { type: 'boolean', description: 'set_config: enable the whitelist.' },
      onlineMode: { type: 'boolean', description: 'set_config: verify players against Mojang accounts.' },
      viewDistance: { type: 'integer', description: 'set_config: view distance in chunks, 3-32.' },
      simulationDistance: { type: 'integer', description: 'set_config: simulation distance in chunks, 3-32.' },
    },
    required: ['action'],
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean' },
        message: { type: 'string' },
      },
      required: ['ok', 'message'],
    },
    render(args, value) {
      return [{ type: 'text', text: String(value?.message ?? '') }]
    },
  },
  async execute(args) {
    const action = typeof args?.action === 'string' ? args.action : ''

    if (action === 'status') {
      return { ok: true, message: summarize(await collectStats()) }
    }

    if (action === 'start' || action === 'stop' || action === 'restart') {
      await serviceAction(action)
      return { ok: true, message: `systemctl --user ${action} ${runtime.unit} finished` }
    }

    if (action === 'set_config') {
      const changes = {}
      for (const [argument, key] of Object.entries(CONFIG_FIELDS)) {
        if (args?.[argument] !== undefined) changes[key] = args[argument]
      }
      if (Object.keys(changes).length === 0) throw new Error('set_config needs at least one setting field')
      const result = await updateConfig(changes)
      return {
        ok: true,
        message: `updated ${result.changed.join(', ')}${result.restarted ? '; the server was restarted' : ''}`,
      }
    }

    if (action === 'diagnose') {
      const state = await analyze(ctx, { force: true })
      const last = state.last
      if (last === null) throw new Error(state.error ?? 'diagnose produced no result')
      return { ok: true, message: summarizeAnalysis(last) }
    }

    throw new Error(`unsupported action: ${action || '(missing)'}`)
  },
  }
}

function summarizeAnalysis(last) {
  const lines = [`[${last.level}] ${last.summary}`]
  for (const finding of last.findings ?? []) lines.push(`- (${finding.severity}) ${finding.title}: ${finding.detail}`)
  for (const suggestion of last.suggestions ?? []) lines.push(`* ${suggestion}`)
  return lines.join('\n')
}

function summarize(stats) {
  const server = stats.server ?? {}
  const players = stats.players ?? { count: 0, names: [] }
  const backups = stats.backups ?? { count: 0, bytes: 0, latest: null }
  const tunnel = stats.tunnel ?? {}
  const lag = stats.lag ?? { warnings: 0, windowMinutes: 10 }
  const memory = stats.memory ?? {}
  const lines = [
    `${server.motd ?? 'Minecraft'} (${server.version ?? '?'}${server.forge ? ` / Forge ${server.forge}` : ''})`,
    `service: ${stats.live ? 'running' : 'stopped'}${stats.live ? ` for ${formatUptime(stats.uptimeSeconds)}` : ''}` +
      (stats.unit?.pid ? `, pid ${stats.unit.pid}` : ''),
    `players: ${players.count}/${server.maxPlayers ?? 20}${players.names?.length ? ` (${players.names.join(', ')})` : ''}`,
    `cpu: ${stats.cpu ?? '?'}% · memory: ${formatBytes(memory.processBytes)} / ${formatBytes(memory.totalBytes)}`,
    `world: ${formatBytes(stats.world?.bytes)} · backups: ${backups.count} (${formatBytes(backups.bytes)}${backups.latest ? `, latest ${backups.latest}` : ''})`,
    `tunnel: ${tunnel.active ? `up${tunnel.address ? ` at ${tunnel.address}` : ''}` : 'down'}`,
    `tick warnings (${lag.windowMinutes} min): ${lag.warnings}`,
    `settings: difficulty ${server.difficulty}, view ${server.viewDistance}, simulation ${server.simulationDistance}, online-mode ${server.onlineMode ? 'on' : 'off'}, whitelist ${server.whiteList ? 'on' : 'off'}, pvp ${server.pvp ? 'on' : 'off'}`,
  ]
  return lines.join('\n')
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '?'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}
