// SPDX-License-Identifier: MIT
/**
 * "DS-assisted checks": when enabled, the plugin asks the profile's default model
 * to review a bounded digest of the server snapshot plus recent warnings/errors,
 * and keeps the latest verdict for the panel and the agent tool.
 *
 * The digest is the only thing sent to the model; full logs never leave the host.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { collectStats, parseLogLine } from './collect.js'
import { run, runtime, splitLines } from './system.js'

const INTERVAL_MS = 5 * 60_000
const TIMEOUT_MS = 90_000
const MAX_DIGEST = 8_000
const STATE_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'mcstat-panel')
const STATE_FILE = join(STATE_DIR, 'state.json')

const SYSTEM_PROMPT = `你是运行在 DeepSeek Harness 面板里的 Minecraft 服务器运维助手。
根据给定的服务器状态、配置和最近的告警/错误日志，判断是否存在需要处理的问题。
只返回一个完整合法的 JSON 对象，不要 markdown 代码块、不要解释：
{"level":"ok|warn|error","summary":"一句话结论（不超过 40 字）","findings":[{"severity":"info|warn|error","title":"短标题","detail":"说明（不超过 60 字）"}],"suggestions":["可执行的建议（不超过 30 字）"]}
规则：
- 只依据给定数据，不要编造玩家名、路径或版本。
- 重点看：服务是否在运行/频繁重启、CPU、内存、磁盘、tick 卡顿、错误日志、备份是否过期、隧道、在线玩家是否异常、配置是否合理。
- findings 最多 4 条，按严重程度排序；没有问题时 level 用 ok，findings 用空数组。
- 用简体中文，具体、简短，保证 JSON 完整闭合。`

let state = { enabled: false, running: false, last: null, error: null }
let inflight = null

/** Snapshot the panel renders (and the agent tool reports). */
export function aiState() {
  return {
    enabled: state.enabled,
    running: state.running,
    last: state.last,
    error: state.error,
    intervalMinutes: Math.round(INTERVAL_MS / 60_000),
  }
}

export async function loadAiSettings() {
  try {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'))
    state.enabled = saved?.ai?.enabled === true
    if (saved?.ai?.last !== undefined && saved.ai.last !== null) state.last = saved.ai.last
  } catch {
    /* first run */
  }
  return aiState()
}

export async function setAiEnabled(enabled) {
  state.enabled = enabled === true
  if (!state.enabled) state.error = null
  await persist()
  return aiState()
}

/** Run one analysis now (or return the one already in flight). */
export function analyze(ctx, options = {}) {
  if (inflight !== null) return inflight
  if (!state.enabled && options.force !== true) return Promise.resolve(aiState())
  const promise = (async () => {
    state.running = true
    state.error = null
    try {
      state.last = await runAnalysis(ctx)
      return aiState()
    } catch (error) {
      state.error = String(error?.message ?? error)
      throw error
    } finally {
      state.running = false
      await persist().catch(() => {})
    }
  })()
  inflight = promise.finally(() => {
    inflight = null
  })
  return inflight
}

/** Called after a panel poll; starts a background analysis when one is due. */
export function maybeAutoAnalyze(ctx) {
  if (!state.enabled || state.running || inflight !== null) return
  const lastAt = typeof state.last?.at === 'number' ? state.last.at : 0
  if (Date.now() - lastAt < INTERVAL_MS) return
  void analyze(ctx).catch(() => {})
}

async function runAnalysis(ctx) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  const selector = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    throw new Error('当前 profile 没有可用的模型服务')
  }
  if (selector === undefined || selector === null || typeof selector.currentSelection !== 'function') {
    throw new Error('当前 profile 没有默认模型')
  }
  const selection = selector.currentSelection()
  if (!selection?.provider || !selection?.model) throw new Error('当前 profile 没有默认模型')

  const digest = await buildDigest()
  const answer = await callModel(llm, selection, digest)
  return {
    at: Date.now(),
    provider: selection.provider,
    model: selection.model,
    level: answer.level,
    summary: answer.summary,
    findings: answer.findings,
    suggestions: answer.suggestions,
    tokens: answer.tokens,
  }
}

async function callModel(llm, selection, digest) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let text = ''
  let tokens = null
  try {
    const options = {
      provider: selection.provider,
      model: selection.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: digest }] }],
      system: SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 1_800,
      signal: controller.signal,
    }
    for await (const chunk of llm.stream(options)) {
      if (chunk.type === 'text-delta') text += chunk.text
      else if (chunk.type === 'usage') tokens = chunk.usage?.totalTokens ?? null
      else if (chunk.type === 'finish') {
        if (chunk.reason.kind === 'error') throw new Error(chunk.reason.failure?.message ?? '模型调用失败')
        if (chunk.reason.kind === 'aborted') throw new Error(chunk.reason.failure?.message ?? '模型调用超时')
      }
    }
  } finally {
    clearTimeout(timer)
  }
  return { ...parseAnalysis(text), tokens }
}

/** The bounded review payload: facts + deduplicated warnings/errors + log tail. */
async function buildDigest() {
  const [stats, recent] = await Promise.all([
    collectStats(),
    run('journalctl', ['--user', '-u', runtime.unit, '--since', '-60min', '--no-pager', '-o', 'cat'], { timeout: 8_000 }),
  ])
  const digest = {
    server: stats.server,
    service: {
      unit: runtime.unit,
      state: stats.unit.state,
      live: stats.live,
      uptimeSeconds: stats.uptimeSeconds,
      pid: stats.unit.pid,
      restarts: stats.unit.restarts,
    },
    players: stats.players,
    resources: {
      cpuPercent: stats.cpu,
      memory: stats.memory,
      world: stats.world,
      backups: stats.backups,
      tunnel: stats.tunnel,
      lag: stats.lag,
    },
    host: stats.host,
    problemsLastHour: summarizeProblems(splitLines(recent)).slice(0, 20),
    recentLog: stats.logs.slice(-15).map((row) => `${row.time} ${row.level} ${row.text}`),
  }
  let text = JSON.stringify(digest, null, 1)
  if (text.length > MAX_DIGEST) text = `${text.slice(0, MAX_DIGEST)}\n...(已截断)`
  return text
}

/** Group WARN/ERROR/FATAL lines by message so repeated noise counts once. */
export function summarizeProblems(lines) {
  const counts = new Map()
  for (const line of lines) {
    const row = parseLogLine(line)
    if (row === null) continue
    if (row.level !== 'WARN' && row.level !== 'ERROR' && row.level !== 'FATAL') continue
    const text = row.text.slice(0, 160)
    const key = `${row.level} | ${text}`
    const entry = counts.get(key) ?? { level: row.level, count: 0, text }
    entry.count += 1
    counts.set(key, entry)
  }
  return [...counts.values()].sort((left, right) => right.count - left.count)
}

/** Tolerant JSON extraction: fences, surrounding prose, and truncated answers. */
export function parseAnalysis(text) {
  const raw = String(text ?? '').trim()
  const start = raw.indexOf('{')
  if (start >= 0) {
    const lastBrace = raw.lastIndexOf('}')
    const candidate = lastBrace > start ? raw.slice(start, lastBrace + 1) : raw.slice(start)
    const parsed = parseJsonLenient(candidate)
    if (parsed !== null) {
      const level = ['ok', 'warn', 'error'].includes(parsed.level) ? parsed.level : 'warn'
      const findings = Array.isArray(parsed.findings)
        ? parsed.findings
            .filter((item) => item !== null && typeof item === 'object')
            .slice(0, 6)
            .map((item) => ({
              severity: ['info', 'warn', 'error'].includes(item.severity) ? item.severity : 'warn',
              title: String(item.title ?? '').slice(0, 120),
              detail: String(item.detail ?? '').slice(0, 600),
            }))
        : []
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .filter((item) => typeof item === 'string')
            .slice(0, 5)
            .map((item) => item.slice(0, 300))
        : []
      return { level, summary: String(parsed.summary ?? '').slice(0, 600), findings, suggestions }
    }
  }
  // Not JSON at all (or too broken to repair): keep the prose, never dump the raw object.
  const quoted = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)
  const summary = quoted !== null ? quoted[1].replace(/\\"/g, '"') : raw.replace(/^[\s{[]+/, '')
  return { level: 'unknown', summary: summary.slice(0, 600), findings: [], suggestions: [] }
}

function parseJsonLenient(text) {
  try {
    return JSON.parse(text)
  } catch {
    /* try to close a truncated answer */
  }
  const repaired = closeJson(text)
  if (repaired === null) return null
  try {
    return JSON.parse(repaired)
  } catch {
    return null
  }
}

/** Close an unterminated JSON object/array so a token-truncated answer still parses. */
function closeJson(text) {
  const stack = []
  let inString = false
  let escaped = false
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{' || character === '[') stack.push(character)
    else if (character === '}' || character === ']') stack.pop()
  }
  let out = text
  if (inString) out += escaped ? '\\"' : '"'
  out = out.replace(/[,:]\s*$/, '')
  while (stack.length > 0) out += stack.pop() === '{' ? '}' : ']'
  return out
}

async function persist() {
  try {
    await mkdir(STATE_DIR, { recursive: true })
    const payload = JSON.stringify({ ai: { enabled: state.enabled, last: state.last } }, null, 2)
    await writeFile(STATE_FILE, payload, 'utf8')
  } catch {
    /* a read-only home must not break the panel */
  }
}
