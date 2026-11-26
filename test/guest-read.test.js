import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveGuestReadPath, resolveGuestWritePath } from '../src/features/guest-read.js'

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'guest-read-'))
  const ws = join(base, 'ws')
  const skills = join(base, 'ext', 'skills')
  mkdirSync(ws, { recursive: true })
  mkdirSync(skills, { recursive: true })
  writeFileSync(join(ws, 'note.md'), '# hi\n')
  writeFileSync(join(skills, 'SKILL.md'), '# skill\n')
  symlinkSync(skills, join(ws, 'skills'))
  symlinkSync(base, join(ws, 'escape'))
  const cfg = { workspaceDir: ws, guestReadRoots: [skills] }
  return { base, ws, skills, cfg, done: () => rmSync(base, { recursive: true, force: true }) }
}

test('工作区里的相对路径：放行', () => {
  const s = sandbox(); try {
    const hit = resolveGuestReadPath(s.cfg, 'note.md')
    assert.equal(hit.ok, true)
    assert.equal(hit.exists, true)
  } finally { s.done() }
})

test('.. 逃逸工作区：拒绝', () => {
  const s = sandbox(); try {
    const hit = resolveGuestReadPath(s.cfg, '../etc/passwd')
    assert.equal(hit.ok, false)
  } finally { s.done() }
})

test('绝对路径指向工作区外：拒绝', () => {
  const s = sandbox(); try {
    assert.equal(resolveGuestReadPath(s.cfg, '/etc/passwd').ok, false)
    assert.equal(resolveGuestReadPath(s.cfg, join(s.base, 'ext', 'other.txt')).ok, false)
  } finally { s.done() }
})

test('软链指向可信根：放行（skills 这类）', () => {
  const s = sandbox(); try {
    const hit = resolveGuestReadPath(s.cfg, 'skills/SKILL.md')
    assert.equal(hit.ok, true)
    assert.equal(hit.exists, true)
  } finally { s.done() }
})

test('软链指向可信根之外：拒绝（绕道逃逸）', () => {
  const s = sandbox(); try {
    mkdirSync(join(s.base, 'private'), { recursive: true })
    writeFileSync(join(s.base, 'private', 'token.txt'), 'secret\n')
    const hit = resolveGuestReadPath(s.cfg, 'escape/private/token.txt')
    assert.equal(hit.ok, false)
  } finally { s.done() }
})

test('不存在的文件：路径合法但 exists=false', () => {
  const s = sandbox(); try {
    const hit = resolveGuestReadPath(s.cfg, 'missing.md')
    assert.equal(hit.ok, true)
    assert.equal(hit.exists, false)
  } finally { s.done() }
})

test('写：工作区里的文件放行', () => {
  const s = sandbox(); try {
    const hit = resolveGuestWritePath(s.cfg, 'new.md')
    assert.equal(hit.ok, true)
    assert.equal(hit.path, join(s.ws, 'new.md'))
  } finally { s.done() }
})

test('写：软链指向可信根内（日记那种）放行', () => {
  const s = sandbox(); try {
    const hit = resolveGuestWritePath(s.cfg, 'skills/draft.md')
    assert.equal(hit.ok, true)
    assert.equal(hit.path, join(s.skills, 'draft.md'))
  } finally { s.done() }
})

test('写：软链指向可信根外拒绝', () => {
  const s = sandbox(); try {
    const hit = resolveGuestWritePath(s.cfg, 'escape/evil.md')
    assert.equal(hit.ok, false)
  } finally { s.done() }
})

test('写：.. 逃逸拒绝', () => {
  const s = sandbox(); try {
    assert.equal(resolveGuestWritePath(s.cfg, '../evil.md').ok, false)
    assert.equal(resolveGuestWritePath(s.cfg, '/tmp/evil.md').ok, false)
  } finally { s.done() }
})
