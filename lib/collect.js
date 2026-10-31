// SPDX-License-Identifier: MIT
/**
 * Everything the panel reads: systemd service facts, `/proc` samples, the journal,
 * world/backup sizes, `server.properties`, mods, and host machine information.
 * One cached snapshot is shared by every poll and by the agent tool.
 */
import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { cpus, loadavg, release } from 'node:os'
import { join } from 'node:path'

import { FALLBACK_ADDRESS, SERVER_DIR, TUNNEL_UNIT, UNIT, run, splitLines } from './system.js'

const CACHE_MS = 4_000
const LOG_LINES = 60
const LAG_MINUTES = 10
const CLOCK_TICKS = 100
const CPU_WINDOW_MS = 250

let cached = null
let inflight = null
/** Previous CPU tick reading, so successive polls measure the interval between them. */
let cpuBaseline = { pid: 0, ticks: 0, at: 0 }

/** Drop the cached snapshot so the next read reflects a just-applied change. */
export function invalidateStats() {
  cached = null
}

/** One shared collection per cache window; concurrent readers reuse the same promise. */
export function statsSnapshot() {
  const now = Date.now()
  if (cached !== null && now - cached.at < CACHE_MS) return Promise.resolve(cached.data)
  if (inflight !== null) return inflight
  const promise = collectStats().then((data) => {
    cached = { at: Date.now(), data }
    return data
  })
  inflight = promise.finally(() => {
    inflight = null
  })
  return inflight
}

export async function collectStats() {
  const show = await run('systemctl', ['--user', 'show', UNIT, '-p', 'ActiveState', '-p', 'MainPID', '-p', 'NRestarts', '--no-pager'])
  const service = parseServiceShow(show)
  const live = service.active && service.pid > 0

  const etime = live ? await uptimeSeconds(service.pid) : null
  // Only the current run can contain online players; a shorter window keeps the
  // parse bounded as the journal grows and drops sessions from earlier restarts.
  const runStart = live && etime !== null ? Math.max(0, Math.floor(Date.now() / 1_000) - etime - 30) : null
  const journalArgs = runStart === null
    ? ['--user', '-u', UNIT, '-n', '200', '--no-pager', '-o', 'cat']
    : ['--user', '-u', UNIT, '--since', `@${runStart}`, '--no-pager', '-o', 'cat']

  const [cpu, processBytes, systemMemoryBytes, journal, lagText, tunnelState, tunnelLog, worldBytes, backups, props, mods, host] =
    await Promise.all([
      live ? sampleCpu(service.pid) : null,
      live ? processMemory(service.pid) : null,
      systemMemory(),
      run('journalctl', journalArgs, { timeout: 10_000, maxBuffer: 64 * 1024 * 1024 }),
      run('journalctl', ['--user', '-u', UNIT, '--since', `-${LAG_MINUTES}min`, '--no-pager', '-o', 'cat'], { timeout: 5_000 }),
      run('systemctl', ['--user', 'is-active', TUNNEL_UNIT]),
      run('journalctl', ['--user', '-u', TUNNEL_UNIT, '-n', '400', '--no-pager', '-o', 'cat'], { timeout: 4_000 }),
      worldSize(),
      backupsSummary(),
      readProperties(),
      modCount(),
      hostInfo(),
    ])

  const lines = splitLines(journal)
  const players = live ? parsePlayers(lines) : []
  const tunnelActive = tunnelState.trim() === 'active'
  const tunnel = {
    active: tunnelActive,
    address: tunnelActive ? (lastTunnelAddress(tunnelLog) || FALLBACK_ADDRESS || null) : null,
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
    host,
    server: serverFacts(props, journal),
    mods,
    logs: parseLog(lines, LOG_LINES),
  }
}

/** The `server.properties` values the panel shows and lets the user edit. */
export function serverFacts(props, journal = '') {
  return {
    motd: decodeUnicode(props.motd ?? 'Minecraft Server'),
    version: lastMatch(journal, /Starting minecraft server version (\S+)/g) ?? null,
    forge: lastMatch(journal, /Forge mod loading, version (\S+),/g) ?? null,
    port: props['server-port'] ?? props['query.port'] ?? '25565',
    difficulty: props.difficulty ?? 'normal',
    onlineMode: props['online-mode'] === 'true',
    whiteList: props['white-list'] === 'true',
    pvp: props.pvp === 'true',
    maxPlayers: Number(props['max-players']) || 20,
    viewDistance: Number(props['view-distance']) || 10,
    simulationDistance: Number(props['simulation-distance']) || 10,
    levelName: props['level-name'] ?? 'world',
  }
}

/* ------------------------------------------------------------------ shell */

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

/** Kernel, distribution, CPU model, load average, host uptime, and disk usage. */
async function hostInfo() {
  const [osRelease, cpuInfo, uptimeText, diskText] = await Promise.all([
    readFile('/etc/os-release', 'utf8').catch(() => ''),
    readFile('/proc/cpuinfo', 'utf8').catch(() => ''),
    readFile('/proc/uptime', 'utf8').catch(() => ''),
    run('df', ['-B1', SERVER_DIR], { timeout: 5_000 }),
  ])
  const cores = (cpuInfo.match(/^processor\s*:/gm) ?? []).length || cpus().length
  const disk = parseDf(diskText)
  return {
    os: /^PRETTY_NAME="?([^"\n]+)"?/m.exec(osRelease)?.[1] ?? release(),
    kernel: release(),
    cpuModel: /^model name\s*:\s*(.+)$/m.exec(cpuInfo)?.[1]?.trim() ?? null,
    cores,
    load: loadavg().map((value) => Math.round(value * 100) / 100),
    uptimeSeconds: Number(uptimeText.trim().split(/\s+/)[0]) || null,
    disk: disk === null ? null : { ...disk, path: SERVER_DIR },
  }
}

function parseDf(text) {
  const lines = text.trim().split('\n').filter((line) => line.trim() !== '')
  const cells = (lines.at(-1) ?? '').trim().split(/\s+/)
  if (cells.length < 4) return null
  const totalBytes = Number(cells[1])
  const usedBytes = Number(cells[2])
  const availableBytes = Number(cells[3])
  if (![totalBytes, usedBytes, availableBytes].every((value) => Number.isFinite(value))) return null
  return { totalBytes, usedBytes, availableBytes, usedRatio: totalBytes > 0 ? usedBytes / totalBytes : 0 }
}

/* ----------------------------------------------------------------- journal */

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

/**
 * Rebuild the online list from join/left events after the latest server start.
 * Journal lines carry a source bracket (`... [minecraft/MinecraftServer]: name
 * joined the game`), so match the parsed message text rather than the raw line.
 */
export function parsePlayers(lines) {
  let anchor = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (/Done \([\d.,]+s\)! For help/.test(lines[index])) anchor = index + 1
  }
  const online = []
  for (let index = anchor; index < lines.length; index += 1) {
    const row = parseLogLine(lines[index])
    if (row === null) continue
    const match = /^(\S+) (joined|left) the game\b/.exec(row.text)
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

/** One journal line as the panel renders it (used by the snapshot and the live stream). */
export function parseLogLine(line) {
  if (line === '' || line.startsWith('-- ')) return null
  const match = /^\[(\d{2}:\d{2}:\d{2})\] \[([^\]]+)\](?:\s+(.*))?$/.exec(line)
  if (match === null) return { time: '', level: '', source: '', text: line }
  const body = match[3] ?? ''
  return {
    time: match[1],
    level: /\/([A-Z]+)$/.exec(match[2])?.[1] ?? '',
    source: /^\[([^\]]+)\]:?\s?/.exec(body)?.[1] ?? '',
    text: body.replace(/^\[[^\]]+\]:?\s?/, ''),
  }
}

export function parseLog(lines, limit) {
  const rows = []
  for (const line of lines) {
    const row = parseLogLine(line)
    if (row !== null) rows.push(row)
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

async function modCount() {
  const entries = await readdir(join(SERVER_DIR, 'mods')).catch(() => [])
  return entries.filter((name) => name.endsWith('.jar')).length
}

export async function readProperties() {
  const text = await readFile(join(SERVER_DIR, 'server.properties'), 'utf8').catch(() => '')
  const props = {}
  for (const line of splitLines(text)) {
    if (line.startsWith('#') || line === '') continue
    const index = line.indexOf('=')
    if (index > 0) props[line.slice(0, index).trim()] = line.slice(index + 1).trim()
  }
  return props
}

/**
 * Patch `server.properties` in place, keeping comments, key order, and unrelated
 * lines. Values are written the way vanilla writes them: non-ASCII escaped, so a
 * UTF-8 MOTD survives the `Properties` loader's ISO-8859-1 read.
 */
export async function writeProperties(patch) {
  const target = join(SERVER_DIR, 'server.properties')
  const text = await readFile(target, 'utf8')
  const pending = new Map(Object.entries(patch).map(([key, value]) => [key, encodePropertyValue(value)]))
  const lines = text.split('\n').map((line) => {
    const index = line.indexOf('=')
    if (index <= 0 || line.startsWith('#')) return line
    const key = line.slice(0, index).trim()
    if (!pending.has(key)) return line
    const value = pending.get(key)
    pending.delete(key)
    return `${key}=${value}`
  })
  for (const [key, value] of pending) lines.push(`${key}=${value}`)
  const temp = `${target}.mcstat.tmp`
  await writeFile(temp, lines.join('\n'), 'utf8')
  await rename(temp, target)
}

function encodePropertyValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/[^\x20-\x7e]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function decodeUnicode(value) {
  return String(value).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
}

/** Address of the tunnel frpc started last, as its own console summary prints it. */
function lastTunnelAddress(text) {
  const matches = [...text.matchAll(/>>([A-Za-z0-9_.-]+:\d+)<<\s*连接你的隧道/g)]
  return matches.length > 0 ? matches[matches.length - 1][1] : null
}
