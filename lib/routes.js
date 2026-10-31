// SPDX-License-Identifier: MIT
/**
 * HTTP surface of the panel, all under `/mcstat`:
 *   GET  /mcstat/stats         one JSON snapshot (also the page's poll target)
 *   GET  /mcstat/logs/stream   Server-Sent Events, one JSON row per journal line
 *   POST /mcstat/action        { action: 'start' | 'stop' | 'restart' }
 *   POST /mcstat/config        { changes: { '<server.properties key>': value } }
 * Mutating routes require a JSON body and reject cross-origin browsers.
 */
import { spawn } from 'node:child_process'

import { serviceAction, updateConfig } from './actions.js'
import { parseLogLine, statsSnapshot } from './collect.js'
import { RUNTIME_DIR, UNIT } from './system.js'

const MAX_BODY_BYTES = 16 * 1024

export async function handleRequest(req, res) {
  const pathname = (req.url ?? '/').split('?')[0]
  try {
    if (pathname === '/mcstat' || pathname === '/mcstat/' || pathname === '/mcstat/stats') {
      await handleStats(req, res)
      return
    }
    if (pathname === '/mcstat/action') {
      await handleAction(req, res)
      return
    }
    if (pathname === '/mcstat/config') {
      await handleConfig(req, res)
      return
    }
    if (pathname === '/mcstat/logs/stream') {
      handleLogStream(req, res)
      return
    }
    reply(res, 404, { ok: false, error: 'not_found' })
  } catch (error) {
    if (!res.headersSent) reply(res, 500, { ok: false, error: String(error?.message ?? error) })
    else res.end()
  }
}

async function handleStats(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    reply(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  reply(res, 200, await statsSnapshot(), req.method === 'HEAD')
}

async function handleAction(req, res) {
  if (!guardWrite(req, res)) return
  let body
  try {
    body = await readJson(req)
  } catch (error) {
    reply(res, 400, { ok: false, error: String(error?.message ?? error) })
    return
  }
  try {
    const result = await serviceAction(body?.action)
    reply(res, 200, { ok: true, action: result.action })
  } catch (error) {
    reply(res, 200, { ok: false, error: String(error?.message ?? error) })
  }
}

async function handleConfig(req, res) {
  if (!guardWrite(req, res)) return
  let body
  try {
    body = await readJson(req)
  } catch (error) {
    reply(res, 400, { ok: false, error: String(error?.message ?? error) })
    return
  }
  try {
    const result = await updateConfig(body?.changes)
    reply(res, 200, { ok: true, restarted: result.restarted, changed: result.changed })
  } catch (error) {
    reply(res, 200, { ok: false, error: String(error?.message ?? error) })
  }
}

/** Mutations need a JSON body (forces a CORS preflight) and a same-origin browser. */
function guardWrite(req, res) {
  if (req.method !== 'POST') {
    reply(res, 405, { ok: false, error: 'method_not_allowed' })
    return false
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '') {
    let sameOrigin = false
    try {
      sameOrigin = new URL(origin).host === req.headers.host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) {
      reply(res, 403, { ok: false, error: 'cross_origin_forbidden' })
      return false
    }
  }
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    reply(res, 415, { ok: false, error: 'json_body_required' })
    return false
  }
  return true
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', (error) => reject(error))
  })
}

function reply(res, status, body, headOnly = false) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(headOnly ? undefined : JSON.stringify(body))
}

/** Stream the journal: one SSE event per line, plus a keep-alive comment. */
function handleLogStream(req, res) {
  if (req.method !== 'GET') {
    reply(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': mcstat stream\n\n')

  const child = spawn('journalctl', ['--user', '-u', UNIT, '-f', '-n', '0', '-o', 'cat'], {
    env: { ...process.env, XDG_RUNTIME_DIR: RUNTIME_DIR, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
  })
  let closed = false
  let buffer = ''
  const send = (line) => {
    if (closed) return
    const row = parseLogLine(line)
    if (row !== null) res.write(`data: ${JSON.stringify(row)}\n\n`)
  }
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) send(line)
  })
  child.on('error', () => cleanup())

  const ping = setInterval(() => {
    if (!closed) res.write(': ping\n\n')
  }, 25_000)

  const cleanup = () => {
    if (closed) return
    closed = true
    clearInterval(ping)
    child.kill('SIGTERM')
    try {
      res.end()
    } catch {
      /* socket already gone */
    }
  }
  req.on('close', cleanup)
  res.on('close', cleanup)
}
