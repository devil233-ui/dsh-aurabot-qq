import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 群会话（group-owner）与私聊长任务档（private-long）的工具集必须一致：
// 差一件就会出现「群里建不了定时任务」这种不对称，而这个缺口在 2026-11-22 真实发生过
// （group-owner 缺 tool-schedule 与 tool-jobs）。人格规则前缀两档不同，那是有意的；
// 工具集不齐一律视为回归。
const yaml = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

function blockOf(presetId) {
  const lines = yaml.split('\n')
  const start = lines.findIndex((l) => new RegExp(`^ {4}- id: ${presetId}$`).test(l))
  assert.notEqual(start, -1, `没找到 preset ${presetId}`)
  const indent = 4
  const out = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i]
    if (/^ {4}- id: /.test(l)) break
    const cur = l.length - l.trimStart().length
    if (l.trim() !== '' && cur <= indent) break
    out.push(l)
  }
  return out
}

function toolIds(presetId) {
  return blockOf(presetId)
    .map((l) => (l.match(/^\s+- id: (tool-[a-z0-9-]+)$/) || [])[1])
    .filter(Boolean)
    .sort()
}

test('群会话与私聊长任务档的工具集一致（含 schedule / jobs）', () => {
  const priv = toolIds('preset-aurabot-private-long')
  const group = toolIds('preset-aurabot-group-owner')
  assert.deepEqual(group, priv, '两档工具集漂移了：补上缺的那件，别让群会话少能力')
})

test('群会话有 schedule 与 jobs（曾在群里建不了定时任务）', () => {
  const group = toolIds('preset-aurabot-group-owner')
  assert.ok(group.includes('tool-schedule'), 'group-owner 缺 tool-schedule')
  assert.ok(group.includes('tool-jobs'), 'group-owner 缺 tool-jobs')
})
