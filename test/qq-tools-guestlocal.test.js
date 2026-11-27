// qq_read_local / qq_write_local 只在「群聊群友轮」挂载：
// 私聊她本来就有原生 read/write；群聊主人/白名单轮工具全开，也用不着这对受限通道（2026-11-27 口径）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import qqTools from '../src/modules/qq-tools/index.js'

function names({ kind, allTools }) {
  const hub = {
    turnSendersAllTools: () => allTools,
    turnSendersAllOwner: () => allTools,
    canSeeImages: () => true,
  }
  const cfg = { enabled: true, ownerQQ: '1', allow: { private: [], groups: ['9'] }, group: { crossRead: 'private' } }
  let build = null
  qqTools.setup({
    core: { hub, onebot: { call: async () => ({}) } },
    config: () => cfg,
    settings: () => ({}),
    dsh: {},
    on: () => {},
    context: () => {},
    tool: (fn) => { build = fn },
  })
  return build({ chat: { kind, chatId: kind === 'group' ? 'group:9' : 'private:1' }, level: 'social', sessionId: 's1' }).map((t) => t.name)
}

test('私聊：不给这对通道（原生 read/write 已够）', () => {
  const n = names({ kind: 'private', allTools: false })
  assert.ok(!n.includes('qq_read_local'), '私聊不该有 qq_read_local')
  assert.ok(!n.includes('qq_write_local'), '私聊不该有 qq_write_local')
})

test('群聊主人/白名单轮：不给', () => {
  const n = names({ kind: 'group', allTools: true })
  assert.ok(!n.includes('qq_read_local') && !n.includes('qq_write_local'))
})

test('群聊群友轮：给', () => {
  const n = names({ kind: 'group', allTools: false })
  assert.ok(n.includes('qq_read_local'), '群友轮需要 qq_read_local')
  assert.ok(n.includes('qq_write_local'), '群友轮需要 qq_write_local')
})
