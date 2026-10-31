import test from 'node:test'
import assert from 'node:assert/strict'

import { parsePlayers } from '../lib/collect.js'

/** A real Forge journal line: timestamp, thread/level, source bracket, message. */
const event = (time, name, action) => `[${time}] [Server thread/INFO] [minecraft/MinecraftServer]: ${name} ${action} the game`
const done = (time) => `[${time}] [Server thread/INFO] [minecraft/DedicatedServer]: Done (3.896s)! For help, type "help"`

test('counts players from Forge journal lines', () => {
  const lines = [
    done('17:34:57'),
    event('17:35:27', 'data_expunged_', 'joined'),
    event('17:36:10', 'SuKuGui', 'joined'),
    event('17:36:43', 'water2H2O', 'joined'),
    event('18:05:48', 'data_expunged_', 'left'),
  ]
  assert.deepEqual(parsePlayers(lines), ['SuKuGui', 'water2H2O'])
})

test('ignores joins from an earlier server session', () => {
  const lines = [
    event('16:57:54', 'Ghost', 'joined'),
    done('17:34:57'),
    event('17:40:00', 'Alice', 'joined'),
  ]
  assert.deepEqual(parsePlayers(lines), ['Alice'])
})

test('a duplicate join does not duplicate the name', () => {
  const lines = [
    done('17:34:57'),
    event('17:40:00', 'Alice', 'joined'),
    event('17:40:05', 'Alice', 'joined'),
    event('17:41:00', 'Bob', 'joined'),
    event('17:42:00', 'Alice', 'left'),
  ]
  assert.deepEqual(parsePlayers(lines), ['Bob'])
})

test('unrelated messages do not look like player events', () => {
  const lines = [
    done('17:34:57'),
    '[17:40:00] [Server thread/INFO] [minecraft/MinecraftServer]: Alice has made the advancement [Bean There, Done That!]',
    '[17:40:01] [Server thread/INFO] [minecraft/ServerGamePacketListenerImpl]: Alice lost connection: Disconnected',
    '[17:40:02] [Server thread/INFO] [minecraft/MinecraftServer]: Alice left the game',
    event('17:41:00', 'Bob', 'joined'),
  ]
  assert.deepEqual(parsePlayers(lines), ['Bob'])
})

test('keeps players who never left before shutdown', () => {
  const lines = [done('17:34:57'), event('17:35:27', 'data_expunged_', 'joined'), event('17:36:10', 'SuKuGui', 'joined')]
  assert.deepEqual(parsePlayers(lines), ['data_expunged_', 'SuKuGui'])
})

test('empty input yields no players', () => {
  assert.deepEqual(parsePlayers([]), [])
  assert.deepEqual(parsePlayers(['']), [])
})
