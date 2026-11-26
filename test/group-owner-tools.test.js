// 群聊「主人本机工具」：档位判定、配置归一化、人格文案与接线契约。
// 这一档不叫 full —— 插件自己的工具还要按 social 语义挂，真正的开关由 hub 按发言人做，
// 所以这里把「纯函数算出什么档」和「接线还在不在」都钉住。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { groupOwnerTools, levelFor, presetFor, toolsGranted } from '../src/chat/access.js'
import { normalize, DEFAULTS } from '../src/core/config.js'
import { privatePermissionCatalog } from '../src/chat/permission-policy.js'
import { rulesText } from '../src/persona/personas.js'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const GROUP = { kind: 'group', chatId: 'group:100200300', groupId: '100200300', userId: '100200300' }
const OTHER_GROUP = { kind: 'group', chatId: 'group:200300400', groupId: '200300400' }
const cfgWith = (group) => normalize({ ownerQQ: '10001', allow: { groups: ['100200300', '200300400'] }, group })

test('groupOwnerTools：默认关，群聊才有效，私聊一律 off', () => {
  assert.equal(groupOwnerTools(normalize({}), GROUP), 'off')
  assert.equal(groupOwnerTools(cfgWith({ ownerTools: 'owner' }), GROUP), 'owner')
  assert.equal(groupOwnerTools(cfgWith({ ownerTools: 'all' }), GROUP), 'off', 'all 模式已移除，写 all 一律按 off')
  assert.equal(groupOwnerTools(cfgWith({ ownerTools: 'owner' }), { kind: 'private', userId: '10001' }), 'off')
  assert.equal(groupOwnerTools(cfgWith({ ownerTools: 'owner' }), { kind: 'system', system: 'autotelic' }), 'off')
})

test('groupOwnerTools：ownerToolsGroups 非空时只对列出的群生效', () => {
  const cfg = cfgWith({ ownerTools: 'owner', ownerToolsGroups: ['100200300'] })
  assert.equal(groupOwnerTools(cfg, GROUP), 'owner')
  assert.equal(groupOwnerTools(cfg, OTHER_GROUP), 'off')
  const all = cfgWith({ ownerTools: 'all', ownerToolsGroups: [] })
  assert.equal(groupOwnerTools(all, OTHER_GROUP), 'off', 'all 模式已移除')
})

test('levelFor：开了本机工具的群给 group-full，其余群仍旧 social', () => {
  assert.equal(levelFor(cfgWith({ ownerTools: 'owner' }), GROUP), 'group-full')
  assert.equal(levelFor(cfgWith({ ownerTools: 'all' }), GROUP), 'social', 'all 不再抬档')
  assert.equal(levelFor(normalize({ ownerQQ: '10001' }), GROUP), 'social')
  assert.equal(levelFor(normalize({ ownerQQ: '10001', ownerLevel: 'full' }), { kind: 'private', userId: '10001' }), 'full')
  assert.equal(levelFor(normalize({ ownerQQ: '10001', ownerLevel: 'full' }), { kind: 'private', userId: '20002' }), 'social')
})

test('presetFor：group-full 走专用 preset，不能落到 private', () => {
  assert.equal(presetFor('group-full', normalize({})), 'aurabot-group-owner')
  assert.equal(presetFor('social', normalize({})), 'aurabot-social')
  assert.equal(presetFor('full', normalize({ longTasks: false })), 'aurabot-private')
  assert.equal(presetFor('full', normalize({ longTasks: true })), 'aurabot-private-long')
})

test('配置归一化：默认 off，非法值回落 off，群号列表收成数组', () => {
  assert.equal(DEFAULTS.group.ownerTools, 'off')
  assert.deepEqual(DEFAULTS.group.ownerToolsGroups, [])
  assert.equal(normalize({}).group.ownerTools, 'off')
  assert.equal(normalize({ group: { ownerTools: 'owner' } }).group.ownerTools, 'owner')
  assert.equal(normalize({ group: { ownerTools: 'yes' } }).group.ownerTools, 'off')
  assert.equal(normalize({ group: { ownerTools: true } }).group.ownerTools, 'off')
  assert.equal(normalize({ group: { ownerTools: 'all' } }).group.ownerTools, 'off', 'all 模式必须归一到 off')
  assert.deepEqual(normalize({ group: { ownerToolsGroups: '100200300, 200300400' } }).group.ownerToolsGroups, ['100200300', '200300400'])
})

test('人格：group-owner 承认手里有工具，social 仍然明说没有', () => {
  const base = normalize({ ownerQQ: '10001', ownerName: '主人' })
  const groupOwner = rulesText('group-owner', base)
  assert.ok(groupOwner.includes('确实有命令和文件工具'), 'group-owner 应当承认有工具')
  assert.ok(groupOwner.includes('工具会被收走'), 'group-owner 要说明没让动手时工具会消失')
  assert.ok(groupOwner.includes('别把命令输出'), 'group-owner 要有群可见的收敛提示')
  assert.ok(!groupOwner.includes('你不能跑命令'), 'group-owner 不能再说自己没有工具')
  const social = rulesText('social', base)
  assert.ok(social.includes('你不能跑命令'), 'social 仍要明说没有工具')
})

test('接线契约：preset、人格变量、闸门、面板开关都在', () => {
  const yml = read('cordis.patch.yml')
  assert.ok(yml.includes('id: preset-aurabot-group-owner'), '缺 preset-aurabot-group-owner')
  assert.ok(yml.includes('id: aurabot-group-owner'), 'preset 的 id 要叫 aurabot-group-owner')
  assert.ok(yml.includes('{{aurabot_rules_group_owner}}'), 'preset 要挂 group-owner 的人格变量')
  assert.ok(/order: 62/.test(yml), 'order 62 与 social(61)/autotelic(63) 不能撞')

  const host = read('src/host.js')
  assert.ok(host.includes("variable('aurabot_rules_group_owner'"), 'host 没定义 aurabot_rules_group_owner')
  assert.ok(host.includes("rulesText('group-owner'"), 'host 没把 group-owner 传给 rulesText')

  const hub = read('src/chat/hub.js')
  assert.ok(hub.includes('applyGroupGate(key, turnSendersAllTools(sessionId, st))'), 'pushToSession 没按发言人开合')
  assert.ok(hub.includes('const GROUP_GUEST_SAFE'), '非主人那一轮要有能力白名单')
  assert.ok(hub.includes('restrict({ allow })'), '闸门要用 allow 白名单收工具')
  assert.ok(hub.includes('knownGlobalNames(agent)'), '要按宿主真实工具名裁剪白名单')
  // 宿主抛的原文是「…; known global tools: a, b」，tools 与冒号之间没有空格，正则要吃得下
  assert.ok(hub.includes('known global tools?\\s*[:：]'), '探测正则要匹配宿主原文格式')
  assert.ok(hub.includes("return null"), '问不出工具名时要能降级')
  assert.ok(!hub.includes('GROUP_TOOL_DENY'), 'deny 名单已废弃，别再引回来')
  const safeLine = /GROUP_GUEST_SAFE = \[([\s\S]*?)\]\r?\n/.exec(hub)
  assert.ok(safeLine, '没找到 GROUP_GUEST_SAFE 定义')
  const patterns = [...safeLine[1].matchAll(/\/((?:\\.|[^/\\])+)\//g)].map((m) => new RegExp(m[1]))
  assert.ok(patterns.length >= 5, '白名单正则没解析出来')
  // 2026-11-26 用户拍板放开只读检索类（read_image / web_fetch / fastctx 三读），
  // 理由：群友轮连查资料都不行。代价是这三条从「危险」降为「放行」，宿主没有工作区钳制（danger-full-access），
  // 所以 read_image 能读任意图片路径、web_fetch 能打 file:// 与内网——这是主动降级，不是漏判。
  const dangerous = ['bash', 'read', 'grep', 'glob', 'mcp__fastctx__inspect_local_file',
    'mcp__fastctx__grep', 'mcp__fastctx__glob',
    'spawn_teammate', 'team_task_create', 'team_task_update', 'create_skill', 'working_directory',
    'remote_upload_file', 'remote_read_session', 'job_kill', 'schedule_create',
    'mcp__fastctx__run', 'mcp__fastctx__run_background', 'mcp__fastctx__replace']
  for (const bad of dangerous) assert.ok(!patterns.some((re) => re.test(bad)), `白名单不能匹配 ${bad}`)
  // 该留的还在
  for (const ok of ['todo_write', 'ask_user_question', 'recall_memory', 'web_search', 'mcp__AkashaTerminal_mihoyoAll__akasha_search']) {
    assert.ok(patterns.some((re) => re.test(ok)), `白名单应当留下 ${ok}`)
  }
  assert.ok(hub.includes("level === 'group-full'"), 'mount 没给 group-full 登记闸门')

  const client = read('client/client.js')
  assert.ok(client.includes("f.choices('group.ownerTools'"), '面板缺 group.ownerTools 选择')
  assert.ok(!/group\.ownerTools'[^)]*value: 'all'/.test(client), '面板不得再提供 all 档')
  assert.ok(client.includes("f.list('group.ownerToolsGroups'"), '面板缺 ownerToolsGroups 列表')
})

test('闸门：群里非主人说话时本机工具被收走', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.AURABOT_WORKSPACE = mkdtempSync(join(tmpdir(), 'aurabot-group-gate-'))
  const { createFakeDsh } = await import('./helpers/fake-dsh.js')
  const { createHub } = await import('../src/chat/hub.js')

  const OWNER = '10001'
  const OTHER = '20002'
  const G = '100200300'
  const cfg = normalize({ ownerQQ: OWNER, allow: { groups: [G] }, longTasks: false, group: { ownerTools: 'owner' } })
  const fake = createFakeDsh({ brain: () => '好' })
  const log = { info () {}, warn () {}, debug () {}, error () {} }
  const hub = createHub({ dsh: fake.ctx, getConfig: () => cfg, log, onebot: { call: async () => ({}) }, buildTools: () => [] })
  const chat = { kind: 'group', chatId: `group:${G}`, groupId: G, userId: OTHER, nickname: '别人' }

  // 真实消息管线：别人的消息进来，装上去的本机工具必须被 restrict 收走
  await hub.pushToSession(chat, [{ type: 'text', text: '跑个 pwd' }], OTHER, { queryText: '跑个 pwd' })
  const agent = fake.agents.get([...fake.agents.keys()].pop())
  assert.ok(agent, '群会话没建起来')
  assert.ok(agent.guestLocked > 0, '非主人那一轮必须把全局工具整层收走（allow: []）')

  // 开合规则：说话的全是主人才放开，掺一个人就收紧
  const sid = [...fake.agents.keys()].pop()
  hub.simulateTurn(sid, [OWNER])
  assert.equal(hub.turnSendersAllOwner(sid), true, '全是主人时应当放开')
  hub.simulateTurn(sid, [OWNER, OTHER])
  assert.equal(hub.turnSendersAllOwner(sid), false, '掺了别人就要收紧')
  hub.simulateTurn(sid, [OTHER])
  assert.equal(hub.turnSendersAllOwner(sid), false, '只有别人时收紧')
})

test('本机工具白名单：归一化保留名单、面板目录里有这个开关', () => {
  assert.deepEqual(normalize({}).capabilityAllow.tools, [], '默认名单必须是空数组')
  assert.deepEqual(normalize({ capabilityAllow: { tools: [' 20002 ', 'abc', '20002'] } }).capabilityAllow.tools, ['20002'],
    '只要合法的 QQ 号，去重、去空格')
  assert.equal(toolsGranted(normalize({ capabilityAllow: { tools: ['20002'] } }), '20002'), true)
  assert.equal(toolsGranted(normalize({ capabilityAllow: { tools: ['20002'] } }), '30003'), false)
  assert.equal(toolsGranted(normalize({ capabilityAllow: { tools: ['20002'] } }), ''), false, '空 QQ 号不算授权')
  assert.ok(privatePermissionCatalog([]).some(({ key }) => key === 'tools'), '面板目录缺「本机工具」这一项')
  assert.equal(DEFAULTS.group.ownerTools, 'off', '授权名单不能顺手把群里的工具档打开')
})

test('工具闸：白名单成员单独说话按主人算，混进别人就收紧，但不等于主人特权', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.AURABOT_WORKSPACE = mkdtempSync(join(tmpdir(), 'aurabot-group-tools-grant-'))
  const { createFakeDsh } = await import('./helpers/fake-dsh.js')
  const { createHub } = await import('../src/chat/hub.js')

  const OWNER = '10001'
  const GRANTED = '20002'
  const OTHER = '30003'
  const G = '100200300'
  const cfg = normalize({
    ownerQQ: OWNER, allow: { groups: [G] }, longTasks: false,
    group: { ownerTools: 'owner' }, capabilityAllow: { tools: [GRANTED] },
  })
  const fake = createFakeDsh({ brain: () => '好' })
  const log = { info () {}, warn () {}, debug () {}, error () {} }
  const hub = createHub({ dsh: fake.ctx, getConfig: () => cfg, log, onebot: { call: async () => ({}) }, buildTools: () => [] })
  const chat = { kind: 'group', chatId: `group:${G}`, groupId: G, userId: GRANTED, nickname: '授权的人' }

  // 新会话的第一轮闸门还没登记（mount 在首轮之后才锁），先发一条把会话建起来，再看第二轮的收放
  await hub.pushToSession(chat, [{ type: 'text', text: '你好' }], GRANTED, { queryText: '你好' })
  await hub.pushToSession(chat, [{ type: 'text', text: '跑个 pwd' }], GRANTED, { queryText: '跑个 pwd' })
  const agent = fake.agents.get([...fake.agents.keys()].pop())
  assert.ok(agent, '群会话没建起来')
  assert.equal(agent.guestLocked, 0, '白名单成员那一轮工具必须放开，不能走 allow: []')

  const sid = [...fake.agents.keys()].pop()
  hub.simulateTurn(sid, [GRANTED])
  assert.equal(hub.turnSendersAllTools(sid), true, '只有白名单成员说话时工具闸放开')
  assert.equal(hub.turnSendersAllOwner(sid), false, '记忆、表情库这些主人专属判定不能跟着放开')

  hub.simulateTurn(sid, [GRANTED, OTHER])
  assert.equal(hub.turnSendersAllTools(sid), false, '掺了没授权的人就收紧')

  hub.simulateTurn(sid, [OWNER])
  assert.equal(hub.turnSendersAllTools(sid), true, '主人自己说话照旧')

  cfg.capabilityAllow.tools.length = 0
  hub.simulateTurn(sid, [GRANTED])
  assert.equal(hub.turnSendersAllTools(sid), false, '名单清空后回到今天的行为')
})

test('工具闸：新会话第一条消息就按说话人判定（首轮不再被锁成「不是主人」）', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.AURABOT_WORKSPACE = mkdtempSync(join(tmpdir(), 'aurabot-group-tools-first-'))
  const { createFakeDsh } = await import('./helpers/fake-dsh.js')
  const { createHub } = await import('../src/chat/hub.js')

  const OWNER = '10001'
  const OTHER = '30003'
  const G = '100200300'
  const cfg = normalize({ ownerQQ: OWNER, allow: { groups: [G] }, longTasks: false, group: { ownerTools: 'owner' } })
  const chat = { kind: 'group', chatId: `group:${G}`, groupId: G, userId: OWNER, nickname: '主人' }
  const build = () => {
    const fake = createFakeDsh({ brain: () => '好' })
    const log = { info () {}, warn () {}, debug () {}, error () {} }
    const hub = createHub({ dsh: fake.ctx, getConfig: () => cfg, log, onebot: { call: async () => ({}) }, buildTools: () => [] })
    return { fake, hub }
  }

  const first = build()
  await first.hub.pushToSession(chat, [{ type: 'text', text: 'pwd' }], OWNER, { queryText: 'pwd' })
  assert.equal(first.fake.agents.get([...first.fake.agents.keys()].pop())?.guestLocked, 0, '主人说第一句就该有工具')

  const second = build()
  await second.hub.pushToSession({ ...chat, userId: OTHER, nickname: '路人' }, [{ type: 'text', text: 'pwd' }], OTHER, { queryText: 'pwd' })
  assert.equal(second.fake.agents.get([...second.fake.agents.keys()].pop())?.guestLocked, 1, '陌生人的第一句必须照旧锁住')
})

test('定时轮：群会话没有人类说话人时，按 group.timerAsOwner 决定给不给工具', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.AURABOT_WORKSPACE = mkdtempSync(join(tmpdir(), 'aurabot-timer-as-owner-'))
  const { createFakeDsh } = await import('./helpers/fake-dsh.js')
  const { createHub } = await import('../src/chat/hub.js')

  const OWNER = '10001'
  const OTHER = '20002'
  const G = '100200300'
  const cfg = normalize({ ownerQQ: OWNER, allow: { groups: [G] }, longTasks: false, group: { ownerTools: 'owner' } })
  const fake = createFakeDsh({ brain: () => '好' })
  const log = { info () {}, warn () {}, debug () {}, error () {} }
  const hub = createHub({ dsh: fake.ctx, getConfig: () => cfg, log, onebot: { call: async () => ({}) }, buildTools: () => [] })
  const chat = { kind: 'group', chatId: `group:${G}`, groupId: G, userId: OWNER, nickname: '主人' }
  await hub.pushToSession(chat, [{ type: 'text', text: '六点提醒喝水' }], OWNER, { queryText: '六点提醒喝水' })
  const sid = [...fake.agents.keys()].pop()
  assert.ok(sid, '群会话没建起来')

  // 定时任务到点那一轮：宿主直接注入，没有任何人类说话人
  hub.simulateTurn(sid, [])
  assert.equal(hub.turnSendersAllTools(sid), false, '默认关着：群会话的自动轮次一个工具都没有')
  assert.equal(hub.turnSendersAllOwner(sid), false, '默认关着：记忆/表情库这些也不给')

  cfg.group.timerAsOwner = true
  assert.equal(hub.turnSendersAllTools(sid), true, '打开后自动轮次按主人那一档算')
  assert.equal(hub.turnSendersAllOwner(sid), true, '开关的语义就是「这一轮等同主人开口」，敏感动作一并放开')

  hub.simulateTurn(sid, [OTHER])
  assert.equal(hub.turnSendersAllTools(sid), false, '群友说话仍然收紧，开关不影响人情轮')
  assert.equal(hub.turnSendersAllOwner(sid), false, '群友说话仍然不是主人')

  // 接线契约：闸门接上了 autoTurnAsOwner，面板有对应开关
  const hubSrc = read('src/chat/hub.js')
  assert.ok(hubSrc.includes('function autoTurnAsOwner()'), '缺 autoTurnAsOwner 判定')
  assert.equal(hubSrc.match(/ownerPrivateChat\(sessionId\) \|\| autoTurnAsOwner\(\)/g).length, 2,
    '两个闸门（主人档 / 工具档）都要接上开关')
  assert.ok(read('client/client.js').includes("f.sw('group.timerAsOwner')"), '面板缺「定时任务那一轮也算主人」开关')

  // 配置归一化：只认 true，其余一律回落 false
  assert.equal(normalize({}).group.timerAsOwner, false)
  assert.equal(normalize({ group: { timerAsOwner: true } }).group.timerAsOwner, true)
  assert.equal(normalize({ group: { timerAsOwner: 'yes' } }).group.timerAsOwner, false)
})

test('定时轮：注入式轮次（不经过 pushToSession）也会按本轮发话人重拨闸门', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.AURABOT_WORKSPACE = mkdtempSync(join(tmpdir(), 'aurabot-injected-turn-gate-'))
  const { createFakeDsh } = await import('./helpers/fake-dsh.js')
  const { createHub } = await import('../src/chat/hub.js')

  const OWNER = '10001'
  const OTHER = '20002'
  const G = '100200300'
  const cfg = normalize({ ownerQQ: OWNER, allow: { groups: [G] }, longTasks: false, group: { ownerTools: 'owner' } })
  const fake = createFakeDsh({ brain: () => '好' })
  const log = { info () {}, warn () {}, debug () {}, error () {} }
  const hub = createHub({ dsh: fake.ctx, getConfig: () => cfg, log, onebot: { call: async () => ({}) }, buildTools: () => [] })
  // 真实接线在 host.js：`ctx.on('session/event', …)` → `hub.onSessionEvent`；这里照原样接上，
  // 否则注入式轮次的 user/message 根本到不了闸门那一步（我第一版测试就是漏了这个）
  fake.ctx.on('session/event', (session, event) => hub.onSessionEvent(session, event))
  const chat = { kind: 'group', chatId: `group:${G}`, groupId: G, userId: OWNER, nickname: '主人' }

  // 群友先说一句：闸门必须收紧
  await hub.pushToSession({ ...chat, userId: OTHER, nickname: '路人' }, [{ type: 'text', text: '在吗' }], OTHER, { queryText: '在吗' })
  const sid = [...fake.agents.keys()].pop()
  const agent = fake.agents.get(sid)
  assert.equal(agent?.guestLocked, 1, '群友那一轮必须收紧')

  const injected = (text) => ({
    type: 'user/message',
    data: { source: { kind: 'system' }, message: { content: [{ type: 'text', text }] } },
  })

  // 真实时序里这一轮已经 turn/end（senders 被清空），定时注入是全新的一轮、没有发话人
  hub.simulateTurn(sid, [])

  // 宿主定时任务注入：没有人类说话人、也不经过 pushToSession
  cfg.group.timerAsOwner = false
  fake.emit('session/event', { id: sid }, injected('（定时任务）该喝水了'))
  assert.equal(agent?.guestLocked, 1, '开关关着时注入轮次仍然不给工具')

  cfg.group.timerAsOwner = true
  fake.emit('session/event', { id: sid }, injected('（定时任务）该喝水了'))
  assert.equal(agent?.guestLocked, 0, '开关打开后注入轮次按主人那一档拨闸门')
})

test('群友轮白名单：只读检索类放行，能动本机/账号的继续收', () => {
  // 从源码里取出真名单来跑样本，避免测试和实现各写一份
  const src = read('src/chat/hub.js')
  const m = /const GROUP_GUEST_SAFE = (\[[\s\S]*?\])\n/.exec(src)
  assert.ok(m, '没找到 GROUP_GUEST_SAFE 定义')
  const list = new Function(`return ${m[1]}`)().map((re) => new RegExp(re))
  const allowed = (name) => list.some((re) => re.test(name))

  for (const name of ['ask_user_question', 'web_search', 'web_fetch', 'read_image',
    'mcp__AkashaTerminal__searchAkasha', 'mcp__HoyoNews__search_news',
    'knowledge_recall', 'rss_list', 'search_meme', 'sticker_find', 'bili_cover', 'bili_frames', 'bili_watch',
    'qq_read_local', 'qq_write_local']) {
    assert.ok(allowed(name), `应放行：${name}`)
  }
  for (const name of ['bash', 'read', 'write', 'edit', 'grep', 'glob',
    'mcp__fastctx__inspect_local_file', 'mcp__fastctx__grep', 'mcp__fastctx__glob',
    'mcp__fastctx__replace', 'mcp__fastctx__run',
    'bili_set_avatar', 'bili_set_sign', 'bili_comment', 'schedule_create', 'spawn_teammate']) {
    assert.ok(!allowed(name), `必须继续收：${name}`)
  }
})

test('转述：主人引用别人的消息说话，工具闸按群友轮收（#2026-11-26）', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  process.env.AURABOT_WORKSPACE = mkdtempSync(join(tmpdir(), 'aurabot-relay-'))
  const { createFakeDsh } = await import('./helpers/fake-dsh.js')
  const { createHub } = await import('../src/chat/hub.js')

  const OWNER = '10001'
  const OTHER = '30003'
  const G = '100200300'
  const cfg = normalize({ ownerQQ: OWNER, allow: { groups: [G] }, longTasks: false, group: { ownerTools: 'owner' } })
  const fake = createFakeDsh({ brain: () => '好' })
  const log = { info () {}, warn () {}, debug () {}, error () {} }
  let quotedFrom = OTHER
  const onebot = { call: async (action) => (action === 'get_msg' ? { sender: { user_id: Number(quotedFrom) } } : {}) }
  const hub = createHub({ dsh: fake.ctx, getConfig: () => cfg, log, onebot, buildTools: () => [] })
  const chat = { kind: 'group', chatId: `group:${G}`, groupId: G, userId: OWNER, nickname: '主人' }

  // 先建会话
  await hub.pushToSession(chat, [{ type: 'text', text: '你好' }], OWNER, { queryText: '你好' })
  const sid = [...fake.agents.keys()].pop()
  const agent = fake.agents.get(sid)

  // 主人引用群友的消息 → 转述，工具收紧
  await hub.pushToSession(chat, [
    { type: 'reply', data: { id: '9001' } },
    { type: 'text', text: '他说这个能删吗' },
  ], OWNER, { queryText: '他说这个能删吗' })
  assert.ok(agent.guestLocked > 0, '转述别人的话时不能按主人全权放开')

  // 主人引用自己的消息 → 不算转述
  quotedFrom = OWNER
  await hub.pushToSession(chat, [
    { type: 'reply', data: { id: '9002' } },
    { type: 'text', text: '接着说刚才那句' },
  ], OWNER, { queryText: '接着说刚才那句' })
  assert.equal(agent.guestLocked, 0, '引用自己的话仍是主人轮')
})

test('可信根：面板能改、宿主能存、归一化不吞非法项', async () => {
  const cfg = normalize({ guestReadRoots: ['  /root/鱼  ', '/root/.dsh/skills', '/root/鱼', 'relative/path', ''] })
  assert.deepEqual(cfg.guestReadRoots, ['/root/鱼', '/root/.dsh/skills'], '去重、去空格、丢相对路径')
  assert.deepEqual(normalize({ guestReadRoots: Array.from({ length: 12 }, (_, i) => `/root/x${i}`) }).guestReadRoots.length, 8, '最多 8 条')
  const host = read('src/host.js')
  assert.ok(host.includes('b.guestReadRoots'), '宿主保存没接收 guestReadRoots')
  const client = read('client/client.js')
  assert.ok(client.includes("f.list('guestReadRoots'"), '面板缺可信根控件')
  const gr = read('src/features/guest-read.js')
  assert.ok(gr.includes('DEFAULT_GUEST_READ_ROOTS'), '没默认可信根')
  assert.ok(gr.includes('realpathSync'), '缺 realpath 判定')
})
