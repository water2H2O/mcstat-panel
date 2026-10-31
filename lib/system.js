// SPDX-License-Identifier: MIT
/**
 * Shared process/system helpers for the mcstat panel: the configured unit and
 * server directory, and one child-process runner every collector and action uses.
 */
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const UNIT = process.env.MCSTAT_UNIT ?? 'mc.service'
export const TUNNEL_UNIT = process.env.MCSTAT_TUNNEL_UNIT ?? 'natfrp.service'
export const SERVER_DIR = process.env.MCSTAT_SERVER_DIR ?? join(homedir(), 'server')
export const RUNTIME_DIR = `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 0}`
export const FALLBACK_ADDRESS = process.env.MCSTAT_TUNNEL_ADDRESS ?? ''

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
