// SPDX-License-Identifier: MIT
/**
 * Host half of the mcstat panel.
 *
 * Collects exactly the facts the `mcstat` shell script prints — service state,
 * uptime, CPU, memory, online players, world/backup sizes, tunnel state, lag
 * warnings — plus a short journal tail, and serves them as JSON at
 * `/mcstat/stats` for the Client page to poll.
 */
import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const UNIT = process.env.MCSTAT_UNIT ?? 'mc.service'
const TUNNEL_UNIT = process.env.MCSTAT_TUNNEL_UNIT ?? 'natfrp.service'
const SERVER_DIR = process.env.MCSTAT_SERVER_DIR ?? join(homedir(), 'server')
const RUNTIME_DIR = `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 0}`
const FALLBACK_ADDRESS = process.env.MCSTAT_TUNNEL_ADDRESS ?? ''
const CACHE_MS = 4_000
const LOG_LINES = 60
const LAG_MINUTES = 10
const CLOCK_TICKS = 100
const CPU_WINDOW_MS = 250

export const inject = ['webServer']

let cached = null
let inflight = null
/** Previous CPU tick reading, so successive polls measure the interval between them. */
let cpuBaseline = { pid: 0, ticks: 0, at: 0 }

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/mcstat', handler: handleRequest }),
    'mcstat: stats route',
  )
}

/** Serve `/mcstat/stats`; keep every failure inside a JSON answer instead of the socket. */
async function handleRequest(req, res) {
  const pathname = (req.url ?? '/').split('?')[0]
  if (pathname !== '/mcstat' && pathname !== '/mcstat/' && pathname !== '/mcstat/stats') {
    reply(res, 404, { ok: false, error: 'not_found' })
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    reply(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const data = await snapshot()
    reply(res, 200, data, req.method === 'HEAD')
  } catch (error) {
    reply(res, 500, { ok: false, error: String(error?.message ?? error) })
  }
}

function reply(res, status, body, headOnly = false) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(headOnly ? undefined : JSON.stringify(body))
}

/** One shared collection per cache window; concurrent polls reuse the same promise. */
function snapshot() {
  const now = Date.now()
  if (cached !== null && now - cached.at < CACHE_MS) return Promise.resolve(cached.data)
  if (inflight !== null) return inflight
  const promise = collect().then((data) => {
    cached = { at: Date.now(), data }
    return data
  })
  inflight = promise.finally(() => {
    inflight = null
  })
  return inflight
}

async function collect() {
  const show = await run('systemctl', ['--user', 'show', UNIT, '-p', 'ActiveState', '-p', 'MainPID', '-p', 'NRestarts', '--no-pager'])
  const service = parseServiceShow(show)
  const live = service.active && service.pid > 0

  const [cpu, etime, processBytes, systemMemoryBytes, journal, lagText, tunnelState, tunnelLog, worldBytes, backups, props, mods] =
    await Promise.all([
      live ? sampleCpu(service.pid) : null,
      live ? uptimeSeconds(service.pid) : null,
      live ? processMemory(service.pid) : null,
      systemMemory(),
      run('journalctl', ['--user', '-u', UNIT, '--no-pager', '-o', 'cat'], { timeout: 8_000 }),
      run('journalctl', ['--user', '-u', UNIT, '--since', `-${LAG_MINUTES}min`, '--no-pager', '-o', 'cat'], { timeout: 5_000 }),
      run('systemctl', ['--user', 'is-active', TUNNEL_UNIT]),
      run('journalctl', ['--user', '-u', TUNNEL_UNIT, '-n', '400', '--no-pager', '-o', 'cat'], { timeout: 4_000 }),
      worldSize(),
      backupsSummary(),
      readProperties(),
      modCount(),
    ])

  const lines = splitLines(journal)
  const players = live ? parsePlayers(lines) : []
  const tunnelActive = tunnelState.trim() === 'active'
  const tunnel = {
    active: tunnelActive,
    address: tunnelActive ? (lastTunnelAddress(tunnelLog) || FALLBACK_ADDRESS || null) : null,
  }

  const server = {
    motd: decodeUnicode(props.motd ?? 'Minecraft Server'),
    version: lastMatch(journal, /Starting minecraft server version (\S+)/g) ?? null,
    forge: lastMatch(journal, /Forge mod loading, version (\S+),/g) ?? null,
    port: props['server-port'] ?? props['query.port'] ?? '25565',
    difficulty: props.difficulty ?? 'normal',
    onlineMode: props['online-mode'] === 'true',
    levelName: props['level-name'] ?? 'world',
    maxPlayers: Number(props['max-players']) || 20,
  }

  return {
    ok: true,
    generatedAt: Date.now(),
    unit: service,
    live,
    uptimeSeconds: etime,
    cpu,
    memory: {
      processBytes,
      totalBytes: systemMemoryBytes.totalBytes,
      usedBytes: systemMemoryBytes.usedBytes,
      availableBytes: systemMemoryBytes.availableBytes,
    },
    players: { count: players.length, names: players },
    world: { bytes: worldBytes },
    backups,
    tunnel,
    lag: { warnings: countMatches(lagText, /Can't keep up/g), windowMinutes: LAG_MINUTES },
    server,
    mods,
    logs: parseLog(lines, LOG_LINES),
  }
}

/* ------------------------------------------------------------------ shell */

function run(command, args, options = {}) {
  const { timeout = 5_000, maxBuffer = 32 * 1024 * 1024 } = options
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout,
        maxBuffer,
        killSignal: 'SIGKILL',
        env: { ...process.env, XDG_RUNTIME_DIR: RUNTIME_DIR, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
      },
      (error, stdout) => resolve(error && (stdout === undefined || stdout === '') ? '' : String(stdout ?? '')),
    )
  })
}

function parseServiceShow(text) {
  const values = {}
  for (const line of splitLines(text)) {
    const index = line.indexOf('=')
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1).trim()
  }
  const pid = Number(values.MainPID) || 0
  return {
    name: UNIT,
    state: values.ActiveState ?? 'unknown',
    active: values.ActiveState === 'active' && pid > 0,
    pid,
    restarts: Number(values.NRestarts) || 0,
  }
}

/* ------------------------------------------------------------------- /proc */

function readTicks(pid) {
  return readFile(`/proc/${pid}/stat`, 'utf8')
    .then((text) => {
      const close = text.lastIndexOf(')')
      if (close < 0) return null
      const fields = text.slice(close + 2).trim().split(/\s+/)
      const ticks = Number(fields[11]) + Number(fields[12])
      return Number.isFinite(ticks) ? ticks : null
    })
    .catch(() => null)
}

/**
 * CPU share since the previous poll of the same process, falling back to a short
 * in-request window on the first sample (or after a restart, which resets ticks).
 */
async function sampleCpu(pid) {
  const ticks = await readTicks(pid)
  if (ticks === null) return null
  const now = Date.now()
  const previous = cpuBaseline
  if (previous.pid === pid && previous.at > 0 && ticks >= previous.ticks) {
    const elapsed = (now - previous.at) / 1_000
    cpuBaseline = { pid, ticks, at: now }
    if (elapsed > 0) return Math.max(0, Math.round(((ticks - previous.ticks) / CLOCK_TICKS / elapsed) * 1_000) / 10)
  }
  await new Promise((resolve) => setTimeout(resolve, CPU_WINDOW_MS))
  const second = await readTicks(pid)
  const at = Date.now()
  if (second === null) return null
  cpuBaseline = { pid, ticks: second, at }
  const windowSeconds = (at - now) / 1_000
  if (windowSeconds <= 0) return null
  return Math.max(0, Math.round(((second - ticks) / CLOCK_TICKS / windowSeconds) * 1_000) / 10)
}

function processMemory(pid) {
  return readFile(`/proc/${pid}/status`, 'utf8')
    .then((text) => {
      const kilobytes = Number(/VmRSS:\s+(\d+) kB/.exec(text)?.[1])
      return Number.isFinite(kilobytes) ? kilobytes * 1024 : null
    })
    .catch(() => null)
}

function parseEtime(text) {
  const raw = text.trim()
  if (raw === '') return null
  const parts = raw.split('-')
  const clock = parts.pop().split(':').map(Number)
  if (clock.some((value) => !Number.isFinite(value))) return null
  let seconds = parts.length > 0 ? Number(parts[0]) * 86_400 : 0
  if (clock.length === 3) seconds += clock[0] * 3_600 + clock[1] * 60 + clock[2]
  else if (clock.length === 2) seconds += clock[0] * 60 + clock[1]
  else seconds += clock[0]
  return seconds
}

async function uptimeSeconds(pid) {
  const text = await run('ps', ['-o', 'etime=', '-p', String(pid)])
  return parseEtime(text)
}

async function systemMemory() {
  const text = await readFile('/proc/meminfo', 'utf8').catch(() => '')
  const read = (key) => {
    const kilobytes = Number(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text)?.[1])
    return Number.isFinite(kilobytes) ? kilobytes * 1024 : 0
  }
  const totalBytes = read('MemTotal')
  const availableBytes = read('MemAvailable')
  return { totalBytes, availableBytes, usedBytes: Math.max(0, totalBytes - availableBytes) }
}

/* ----------------------------------------------------------------- journal */

function splitLines(text) {
  return text.split('\n').map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trimEnd())
}

function lastMatch(text, pattern) {
  let value = null
  for (const match of text.matchAll(pattern)) value = match[1]
  return value
}

function countMatches(text, pattern) {
  let count = 0
  for (const _ of text.matchAll(pattern)) count += 1
  return count
}

/** Rebuild the online list from join/left events after the latest server start. */
function parsePlayers(lines) {
  let anchor = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (/Done \([\d.,]+s\)! For help/.test(lines[index])) anchor = index + 1
  }
  const online = []
  for (let index = anchor; index < lines.length; index += 1) {
    const match = /\]\s+(\S+) (joined|left) the game/.exec(lines[index])
    if (match === null) continue
    const [, name, action] = match
    const at = online.indexOf(name)
    if (action === 'joined') {
      if (at < 0) online.push(name)
    } else if (at >= 0) {
      online.splice(at, 1)
    }
  }
  return online
}

function parseLog(lines, limit) {
  const rows = []
  for (const line of lines) {
    if (line === '' || line.startsWith('-- ')) continue
    const match = /^\[(\d{2}:\d{2}:\d{2})\] \[([^\]]+)\](?:\s+(.*))?$/.exec(line)
    if (match === null) {
      rows.push({ time: '', level: '', source: '', text: line })
      continue
    }
    const body = match[3] ?? ''
    rows.push({
      time: match[1],
      level: /\/([A-Z]+)$/.exec(match[2])?.[1] ?? '',
      source: /^\[([^\]]+)\]:?\s?/.exec(body)?.[1] ?? '',
      text: body.replace(/^\[[^\]]+\]:?\s?/, ''),
    })
  }
  return rows.slice(-limit)
}

/* ------------------------------------------------------------------- files */

async function worldSize() {
  const text = await run('du', ['-sb', join(SERVER_DIR, 'world')], { timeout: 15_000 })
  const bytes = Number(/^(\d+)/.exec(text.trim())?.[1])
  return Number.isFinite(bytes) ? bytes : 0
}

async function backupsSummary() {
  const directory = join(SERVER_DIR, 'simplebackups')
  const files = (await readdir(directory).catch(() => [])).filter((name) => name.endsWith('.zip'))
  let bytes = 0
  let latest = null
  let latestAt = 0
  for (const name of files) {
    const info = await stat(join(directory, name)).catch(() => null)
    if (info === null) continue
    bytes += info.size
    if (info.mtimeMs > latestAt) {
      latestAt = info.mtimeMs
      latest = name
    }
  }
  return { count: files.length, bytes, latest, latestAt: latestAt || null }
}

async function readProperties() {
  const text = await readFile(join(SERVER_DIR, 'server.properties'), 'utf8').catch(() => '')
  const props = {}
  for (const line of splitLines(text)) {
    if (line.startsWith('#') || line === '') continue
    const index = line.indexOf('=')
    if (index > 0) props[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return props
}

async function modCount() {
  const entries = await readdir(join(SERVER_DIR, 'mods')).catch(() => [])
  return entries.filter((name) => name.endsWith('.jar')).length
}

function decodeUnicode(value) {
  return String(value).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
}

/** Address of the tunnel frpc started last, as its own console summary prints it. */
function lastTunnelAddress(text) {
  const matches = [...text.matchAll(/>>([A-Za-z0-9_.-]+:\d+)<<\s*连接你的隧道/g)]
  return matches.length > 0 ? matches[matches.length - 1][1] : null
}
