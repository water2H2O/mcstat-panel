// SPDX-License-Identifier: MIT
/**
 * Shared process/system helpers for the mcstat panel: resolved settings (unit,
 * server directory, tunnel), child-process runners, and one-time autodetection so
 * the plugin works on someone else's machine without environment variables.
 */
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const RUNTIME_DIR = `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 0}`

/** Live settings; mutated once by `resolveSettings` and read by every collector. */
export const runtime = {
  unit: process.env.MCSTAT_UNIT ?? 'mc.service',
  tunnelUnit: process.env.MCSTAT_TUNNEL_UNIT ?? 'natfrp.service',
  serverDir: process.env.MCSTAT_SERVER_DIR ?? join(homedir(), 'server'),
  tunnelAddress: process.env.MCSTAT_TUNNEL_ADDRESS ?? '',
  /** True when the unit/serverDir above came from autodetection rather than config/env. */
  detected: false,
}

const CHILD_ENV = { ...process.env, XDG_RUNTIME_DIR: RUNTIME_DIR, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }

/** Run one command and report its outcome instead of throwing. */
export function runResult(command, args, options = {}) {
  const { timeout = 5_000, maxBuffer = 32 * 1024 * 1024 } = options
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout, maxBuffer, killSignal: 'SIGKILL', env: CHILD_ENV },
      (error, stdout, stderr) => {
        resolve({
          ok: error === null,
          code: typeof error?.code === 'number' ? error.code : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          error: error === null ? null : String(error.message ?? error),
        })
      },
    )
  })
}

/** Run one command for its stdout; a failed command yields `''` (or its partial output). */
export async function run(command, args, options = {}) {
  const result = await runResult(command, args, options)
  return result.ok || result.stdout !== '' ? result.stdout : ''
}

/** Split command output into trimmed, ANSI-free lines. */
export function splitLines(text) {
  return text.split('\n').map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trimEnd())
}

/**
 * Merge the bundle row's config over the environment, then autodetect whatever is
 * still missing. Values are only replaced when the plugin has no explicit source,
 * so a user's `cordis.patch.yml` or environment always wins.
 */
export async function resolveSettings(config = {}) {
  const pick = (key) => (typeof config?.[key] === 'string' && config[key] !== '' ? config[key] : undefined)

  let unit = pick('unit') ?? process.env.MCSTAT_UNIT ?? null
  let serverDir = pick('serverDir') ?? process.env.MCSTAT_SERVER_DIR ?? null

  runtime.tunnelUnit = pick('tunnelUnit') ?? process.env.MCSTAT_TUNNEL_UNIT ?? 'natfrp.service'
  runtime.tunnelAddress = pick('tunnelAddress') ?? process.env.MCSTAT_TUNNEL_ADDRESS ?? ''

  if (unit === null || serverDir === null) {
    const found = await detectMinecraftService(unit)
    if (unit === null) {
      unit = found?.unit ?? 'mc.service'
      runtime.detected = found !== null
    }
    if (serverDir === null) serverDir = found?.dir ?? join(homedir(), 'server')
  }

  runtime.unit = unit
  runtime.serverDir = serverDir
  return runtime
}

/**
 * Find a user service whose working directory holds a Minecraft server. Running
 * units are preferred, but installed units whose name hints at Minecraft are
 * checked too, so a stopped server is still detected.
 */
async function detectMinecraftService(preferredUnit) {
  const [runningText, filesText] = await Promise.all([
    run('systemctl', ['--user', 'list-units', '--type=service', '--state=running', '--no-legend', '--plain']),
    run('systemctl', ['--user', 'list-unit-files', '--type=service', '--no-legend', '--plain']),
  ])
  const names = []
  const push = (name) => {
    if (name.endsWith('.service') && !name.startsWith('dbus-') && !names.includes(name)) names.push(name)
  }
  if (preferredUnit !== null) push(preferredUnit)
  for (const name of splitLines(runningText).map((line) => line.trim().split(/\s+/)[0])) push(name)
  for (const name of splitLines(filesText).map((line) => line.trim().split(/\s+/)[0])) push(name)

  // Services whose name hints at Minecraft are checked first; the directory check
  // below is what actually decides, so unusual names still work.
  const score = (name) => (/minecraft|forge|mc|server/i.test(name) ? 1 : 0)
  names.sort((left, right) => score(right) - score(left))

  for (const name of names.slice(0, 20)) {
    const shown = await run('systemctl', ['--user', 'show', name, '-p', 'WorkingDirectory', '--no-pager'])
    const dir = /^WorkingDirectory=(.+)$/m.exec(shown)?.[1]?.trim()
    if (dir === undefined || dir === '') continue
    const hasProperties = await stat(join(dir, 'server.properties')).then(() => true).catch(() => false)
    if (hasProperties) return { unit: name, dir }
  }
  return null
}
