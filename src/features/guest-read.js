// 群友轮能读哪些本机文件：路径必须落在「可信根」之内，且软链不得指到外面。
import { realpathSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

/** 工作区之外另外放行的目录（主人 2026-11-26 指定） */
export const DEFAULT_GUEST_READ_ROOTS = [
  '/root/.dsh/skills',
  '/root/.dsh/plugins-data/aurabot/modules-data/local-diary',
  '/root/nbr/cache/nonebot_plugin_parser_lite',
]

const norm = (p) => String(p || '').replace(/[\\/]+$/, '')

const realish = (p) => {
  try { return norm(realpathSync(p)) } catch { return norm(p) }
}

/** 可信根（工作区在前），全部取真实路径：软链根按指向的真实目录比 */
export function guestReadRoots(cfg) {
  const ws = norm(cfg?.workspaceDir)
  const list = Array.isArray(cfg?.guestReadRoots) ? cfg.guestReadRoots.map(String).filter(Boolean) : []
  const extra = list.length ? list : DEFAULT_GUEST_READ_ROOTS
  return [...new Set([ws, ...extra].filter(Boolean).map(realish))]
}

const inside = (root, p) => p === root || p.startsWith(root + sep)

/** 文件不存在时，取「最近一个存在的祖先」的真实路径，再把不存在的尾段拼回去 */
function realpathDeep(abs) {
  const tail = []
  let base = abs
  for (;;) {
    try { return norm([realpathSync(base), ...tail].join(sep)) } catch { /* 继续往上 */ }
    const up = dirname(base)
    if (up === base) return norm(abs)
    tail.unshift(base.slice(up.length).replace(/^[\\/]+/, ''))
    base = up
  }
}

/**
 * 判定一个路径能不能读。
 * 返回 { ok: true, path, exists } 或 { ok: false, reason }
 */
export function resolveGuestReadPath(cfg, raw) {
  const want = String(raw ?? '').trim()
  if (!want) return { ok: false, reason: '没给路径' }
  if (want.includes('\0')) return { ok: false, reason: '路径里有空字节' }
  const ws = norm(cfg?.workspaceDir)
  if (!ws) return { ok: false, reason: '没配置工作区' }
  // 相对路径按工作区解析；绝对路径原样（再靠下面的判定挡）
  const abs = resolve(ws, want)
  const roots = guestReadRoots(cfg)
  // 第一关：字面路径（已消掉 ..）必须落在某个根里
  if (!roots.some((r) => inside(r, abs))) return { ok: false, reason: '不在允许读的目录里' }
  // 第二关：真实路径（软链跟到底）也必须落在某个根里
  const real = realpathDeep(abs)
  if (!roots.some((r) => inside(r, real))) return { ok: false, reason: '这个路径指向允许目录之外' }
  let exists = false
  try { exists = statSync(real).isFile() } catch { exists = false }
  return { ok: true, path: real, exists }
}

/**
 * 写盘的落点判定：和读一样两关，但返回的是「要写的绝对路径」。
 * 已存在的软链按真实落点判（防止 diary -> modules-data 这类穿透写到可信根外）。
 * 不存在的文件：取最近存在祖先的真实路径，再拼回尾段。
 */
export function resolveGuestWritePath(cfg, raw) {
  const hit = resolveGuestReadPath(cfg, raw)
  if (!hit.ok) return hit
  return { ok: true, path: hit.path }
}
