import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand, runCommand } from '../src/chat/commands.js'
import { runPermissionsCommand } from '../src/chat/permissions-command.js'

const owner = { kind: 'private', userId: '123456' }
const guest = { kind: 'private', userId: '10000002' }
function setup() {
  let config = { ownerQQ: owner.userId, allow: { private: [], groups: [] }, capabilityAllow: { image: [], song: [], video: [] }, commandAllow: {} }
  const deps = { getConfig: () => config, setConfig: (v) => { config = v }, extraCommands: [{ name: 'hello', module: 'probe', delegatable: true }, { name: 'admin', module: 'probe' }] }
  return { deps, config: () => config, call: (arg, msg = owner) => runPermissionsCommand(arg, msg, deps) }
}

test('owner can inspect and change independent permissions without implicitly granting chat', () => {
  const x = setup()
  assert.match(x.call('添加 生图 10000002'), /暂不生效/)
  assert.deepEqual(x.config().allow.private, [])
  assert.match(x.call('授权 10000002 私聊 reset'), /已添加/)
  assert.match(x.call('授权 10000002 model ext:probe:admin'), /无法授予/)
  assert.equal(x.config().commandAllow.model, undefined)
  assert.match(x.call('添加 命令 ext:probe:hello 10000002'), /已添加/)
  assert.match(x.call('10000002'), /reset/)
  assert.match(x.call('列表 命令 reset'), /10000002/)
  assert.match(x.call('添加 群 1234567'), /已添加/)
  assert.match(x.call('档位 qqNickname all'), /全局档位/)
  assert.equal(x.config().profilePerms.qqNickname, 'all')
  assert.match(x.call('档位 qqNickname invalid'), /用法/)
  assert.match(x.call('档位 whitelist all', guest), /主人私聊/)
  assert.match(x.call('移除 私聊 10000002'), /暂不生效/)
  assert.deepEqual(x.config().commandAllow.reset, ['10000002'])
  assert.match(x.call('移除 命令 reset 10000002'), /已移除/)
  assert.deepEqual(x.config().commandAllow.reset, [])
  assert.match(x.call('添加 命令 permissions 10000002'), /无法授予/)
  assert.match(x.call('添加 私聊 123abc456'), /完整的数字|完整的 QQ 号/)
})

test('本机工具名单：群里直接生效，不要求私聊白名单，也不报「暂不生效」', () => {
  const x = setup()
  const out = x.call('授权 20002 工具')
  assert.match(out, /已添加 本机工具/)
  assert.doesNotMatch(out, /暂不生效/, '工具授权不看私聊白名单')
  assert.deepEqual(x.config().capabilityAllow.tools, ['20002'])
  assert.deepEqual(x.config().allow.private, [], '不该顺手把私聊打开')
  assert.match(x.call('20002'), /本机工具/)
  assert.match(x.call('列表 工具'), /20002/)
  assert.match(x.call('撤销 20002 工具'), /已移除/)
  assert.deepEqual(x.config().capabilityAllow.tools, [])
})

test('permission administration is reserved for the owner private chat', async () => {
  const x = setup()
  assert.match(x.call('添加 私聊 10000002', guest), /主人私聊/)
  assert.match(x.call('添加 私聊 10000002', { ...owner, kind: 'group' }), /主人私聊/)
  assert.deepEqual(x.config().allow.private, [])
  const cmd = parseCommand('/权限 添加 私聊 10000002', [{ name: '权限', module: 'hostile' }])
  assert.equal(cmd.name, 'permissions')
  assert.equal(cmd.ext, undefined)
  assert.match(await runCommand(cmd, guest, x.deps), /主人私聊/)
  assert.deepEqual(x.config().allow.private, [])
})
