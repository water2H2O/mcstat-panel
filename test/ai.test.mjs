import test from 'node:test'
import assert from 'node:assert/strict'

import { parseAnalysis, summarizeProblems } from '../lib/ai.js'

test('parses a plain JSON answer', () => {
  const answer = parseAnalysis(
    JSON.stringify({
      level: 'warn',
      summary: '内存偏高，卡顿 3 次',
      findings: [{ severity: 'warn', title: '内存', detail: '进程占用 8.2G' }],
      suggestions: ['降低视距'],
    }),
  )
  assert.equal(answer.level, 'warn')
  assert.equal(answer.summary, '内存偏高，卡顿 3 次')
  assert.deepEqual(answer.findings, [{ severity: 'warn', title: '内存', detail: '进程占用 8.2G' }])
  assert.deepEqual(answer.suggestions, ['降低视距'])
})

test('parses an answer wrapped in a markdown fence', () => {
  const answer = parseAnalysis('```json\n{"level":"ok","summary":"一切正常","findings":[],"suggestions":[]}\n```')
  assert.equal(answer.level, 'ok')
  assert.equal(answer.summary, '一切正常')
})

test('falls back to raw text when the answer is not JSON', () => {
  const answer = parseAnalysis('服务器看起来没问题')
  assert.equal(answer.level, 'unknown')
  assert.equal(answer.summary, '服务器看起来没问题')
  assert.deepEqual(answer.findings, [])
})

test('drops unknown severities and clamps lists', () => {
  const findings = Array.from({ length: 9 }, (_, index) => ({ severity: 'panic', title: `t${index}`, detail: 'd' }))
  const answer = parseAnalysis(JSON.stringify({ level: '???', summary: 's', findings, suggestions: Array(9).fill('x') }))
  assert.equal(answer.level, 'warn')
  assert.equal(answer.findings.length, 6)
  assert.equal(answer.findings[0].severity, 'warn')
  assert.equal(answer.suggestions.length, 5)
})

test('repairs a token-truncated answer', () => {
  const truncated =
    '{"level":"error","summary":"服务未运行","findings":[{"severity":"error","title":"服务未运行","detail":"进程已退出，systemd 判为失败"'
  const answer = parseAnalysis(truncated)
  assert.equal(answer.level, 'error')
  assert.equal(answer.summary, '服务未运行')
  assert.equal(answer.findings.length, 1)
  assert.equal(answer.findings[0].title, '服务未运行')
})

test('groups repeated warnings by message', () => {
  const line = (level, message) => `[10:00:00] [Server thread/${level}] [minecraft/MinecraftServer]: ${message}`
  const problems = summarizeProblems([
    line('WARN', "Can't keep up! Is the server overloaded?"),
    line('WARN', "Can't keep up! Is the server overloaded?"),
    line('ERROR', 'Entity bountifulfares:flour has no attributes'),
    line('INFO', 'water2H2O joined the game'),
  ])
  assert.equal(problems.length, 2)
  assert.equal(problems[0].count, 2)
  assert.equal(problems[0].level, 'WARN')
  assert.equal(problems[1].level, 'ERROR')
})
