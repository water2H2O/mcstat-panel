#!/usr/bin/env node
// Dependency-free checks: JS syntax, JSON manifests, dsh manifest fields, icon.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const at = (name) => join(root, name)

for (const script of ['index.js', 'client.js', 'lib/system.js', 'lib/collect.js', 'lib/actions.js', 'lib/routes.js', 'lib/tool.js']) {
  execFileSync(process.execPath, ['--check', at(script)], { stdio: 'inherit' })
  console.log(`syntax ok: ${script}`)
}

for (const json of ['package.json', 'locale/en.json', 'locale/zh.json']) {
  JSON.parse(readFileSync(at(json), 'utf8'))
  console.log(`json ok: ${json}`)
}

const manifest = JSON.parse(readFileSync(at('package.json'), 'utf8'))
if (manifest.dsh?.bundle?.patch === undefined) throw new Error('package.json is missing dsh.bundle.patch')
if (manifest.dsh?.client?.platform !== 'web') throw new Error('package.json needs dsh.client.platform = "web"')
for (const key of ['.', './client', './icon']) {
  const target = manifest.exports?.[key]
  if (typeof target !== 'string') throw new Error(`package.json export "${key}" is missing`)
  statSync(at(target))
}

for (const locale of ['en', 'zh']) {
  const title = JSON.parse(readFileSync(at(`locale/${locale}.json`), 'utf8'))?.meta?.title
  if (typeof title !== 'string' || title.length === 0) throw new Error(`locale/${locale}.json needs meta.title`)
}

const icon = readFileSync(at('icon.svg'))
if (!icon.toString('utf8').startsWith('<svg')) throw new Error('icon.svg does not look like SVG')
if (icon.byteLength > 256 * 1024) throw new Error('icon.svg exceeds the 256 KiB limit')

console.log('all checks passed')
