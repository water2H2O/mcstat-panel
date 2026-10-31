// SPDX-License-Identifier: MIT
/**
 * Write side of the panel: start/stop/restart the unit, and patch the editable
 * `server.properties` values. Every mutation is one exported function so the
 * HTTP routes and the agent tool perform exactly the same operation.
 */
import { invalidateStats, writeProperties } from './collect.js'
import { UNIT, runResult } from './system.js'

const ACTION_TIMEOUTS = { start: 120_000, stop: 180_000, restart: 240_000 }

/** `server.properties` keys the panel may change, with their accepted values. */
export const EDITABLE_KEYS = [
  'difficulty',
  'motd',
  'max-players',
  'pvp',
  'white-list',
  'online-mode',
  'view-distance',
  'simulation-distance',
]

const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard']
const NUMBER_LIMITS = {
  'max-players': [1, 1000],
  'view-distance': [3, 32],
  'simulation-distance': [3, 32],
}
const BOOLEAN_KEYS = ['pvp', 'white-list', 'online-mode']

export async function isServiceActive() {
  const result = await runResult('systemctl', ['--user', 'is-active', UNIT], { timeout: 5_000 })
  return result.stdout.trim() === 'active'
}

/** Run one systemd action on the server unit and wait for the job to finish. */
export async function serviceAction(action) {
  if (typeof action !== 'string' || !Object.hasOwn(ACTION_TIMEOUTS, action)) {
    throw new Error(`unsupported action: ${String(action)}`)
  }
  const result = await runResult('systemctl', ['--user', action, UNIT], { timeout: ACTION_TIMEOUTS[action] })
  invalidateStats()
  if (!result.ok) {
    const reason = result.stderr.trim() || result.error || `systemctl ${action} exited with ${result.code}`
    throw new Error(reason)
  }
  return { action }
}

/**
 * Apply validated `server.properties` changes. A running server is stopped first
 * (so vanilla cannot overwrite the file while saving on shutdown) and started
 * again afterwards.
 */
export async function updateConfig(changes) {
  const patch = validateChanges(changes)
  const keys = Object.keys(patch)
  if (keys.length === 0) return { restarted: false, changed: [] }

  const wasActive = await isServiceActive()
  if (wasActive) await serviceAction('stop')
  try {
    await writeProperties(patch)
    invalidateStats()
  } catch (error) {
    if (wasActive) await serviceAction('start').catch(() => {})
    throw error
  }
  if (wasActive) await serviceAction('start')
  return { restarted: wasActive, changed: keys }
}

/** Validate an untrusted settings object into a `server.properties` patch. */
export function validateChanges(changes) {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new Error('changes must be an object')
  }
  const patch = {}
  for (const [key, raw] of Object.entries(changes)) {
    if (!EDITABLE_KEYS.includes(key)) throw new Error(`unsupported setting: ${key}`)
    if (key === 'difficulty') {
      if (typeof raw !== 'string' || !DIFFICULTIES.includes(raw)) {
        throw new Error(`difficulty must be one of ${DIFFICULTIES.join(', ')}`)
      }
      patch[key] = raw
      continue
    }
    if (key === 'motd') {
      if (typeof raw !== 'string') throw new Error('motd must be a string')
      const motd = raw.replace(/[\r\n]+/g, ' ').trim()
      if (motd === '') throw new Error('motd must not be empty')
      if (motd.length > 200) throw new Error('motd must be at most 200 characters')
      patch[key] = motd
      continue
    }
    if (BOOLEAN_KEYS.includes(key)) {
      if (typeof raw !== 'boolean') throw new Error(`${key} must be a boolean`)
      patch[key] = raw ? 'true' : 'false'
      continue
    }
    const [min, max] = NUMBER_LIMITS[key]
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} must be an integer between ${min} and ${max}`)
    }
    patch[key] = String(value)
  }
  return patch
}
