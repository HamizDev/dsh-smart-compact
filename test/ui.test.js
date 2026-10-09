import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { apply, isTrustedLocalRequest } from '../lib/index.js'

const loopback = (overrides = {}) => ({
  method: 'GET',
  headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', ...overrides },
  socket: { remoteAddress: '127.0.0.1' },
})

test('local settings guard rejects cross-origin, remote host and remote peer', () => {
  assert.equal(isTrustedLocalRequest(loopback()), true)
  assert.equal(isTrustedLocalRequest(loopback({ origin: 'http://evil.invalid:3080' })), false)
  assert.equal(isTrustedLocalRequest(loopback({ host: 'public.example:3080' })), false)
  assert.equal(isTrustedLocalRequest(loopback({ 'sec-fetch-site': 'cross-site' })), false)
  assert.equal(isTrustedLocalRequest({ ...loopback(), socket: { remoteAddress: '198.51.100.7' } }), false)
})

test('optional settings route saves ratio atomically and updates effective threshold', async () => {
  const path = mkdtempSync(join(tmpdir(), 'dsc-test-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = path
  let route
  const agent = { session: { id: 's' } }
  const calls = []
  const ctx = {
    logger: () => ({ info() {}, warn() {} }),
    on(name, fn) { if (name === 'agent/pre-step') this.step = fn },
    agentPresets: { serviceFor: () => ({ config: { auto: false, maxOverflowRetries: 1 }, compactIfNeeded: async () => { calls.push('compact'); return {} } }) },
    sessionProjections: { snapshot: () => ({ values: { contextPressure: { contextWindow: 100000 } } }) },
    tokenMeter: { measure: () => ({ totalTokens: 65000 }) },
    inject(_names, fn) { fn({ effect: (callback) => callback(), webServer: { register: (registration) => { route = registration } } }) },
  }
  const respond = async (method, body) => {
    const req = {
      ...loopback({ 'content-type': 'application/json' }), method,
      async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) },
    }
    const result = { status: null, body: null,
      writeHead(status) { this.status = status },
      end(text) { this.body = JSON.parse(text) },
    }
    await route.handler(req, result)
    return result
  }
  try {
    apply(ctx)
    assert.equal(route.path, '/dsh-smart-compact/api/config')
    assert.equal((await respond('GET')).body.config.triggerRatio, 0.9)
    assert.equal((await respond('GET')).body.setup.mode, 'not-observed')
    assert.equal((await respond('POST', { triggerRatio: 0.6 })).status, 200)
    assert.equal((await respond('GET')).body.config.triggerRatio, 0.6)
    assert.equal(JSON.parse(readFileSync(join(path, 'smart-compact.json'), 'utf8')).triggerRatio, 0.6)
    const rejected = await respond('POST', { triggerRatio: -1 })
    assert.equal(rejected.status, 400)
    assert.equal((await respond('GET')).body.config.triggerRatio, 0.6)
    await ctx.step({ agent, signal: new AbortController().signal }, async () => {})
    assert.equal(calls.length, 1, '65K tokens should trigger after changing threshold to 60%')
    const observed = (await respond('GET')).body.setup
    assert.equal(observed.mode, 'exclusive')
    assert.match(observed.observedAt, /^[0-9]{4}-/)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(path, { recursive: true, force: true })
  }
})

test('client settings card loads without adding a duplicate conversation ring', () => {
  let registration
  const document = {
    querySelector: () => null,
    createElement: () => ({ setAttribute() {} }),
    head: { appendChild() {} },
  }
  const window = { __ModuleLoader__: { load(value) { registration = value } } }
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), { window, document })
  assert.equal(registration.id, 'dsh-smart-compact')
  const plugin = registration.factory((name) => {
    assert.equal(name, 'react')
    return {}
  })
  assert.deepEqual(Array.from(plugin.inject), ['slots'])
  let slot
  plugin.apply({ slots: { inject(name, fn) { assert.equal(name, 'settings.plugins.tab'); fn() }, register(spec) { slot = spec } } })
  assert.equal(slot.id, 'smart-compact')
  assert.equal(slot.name, 'settings.plugins.tab')
  assert.equal(slot.order, 20)
  assert.equal(slot.label, 'Smart Compact')
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(!client.includes('conversation.input.right'))
  assert.ok(!client.includes('settings.plugin.item'))
})


function inspectOnboarding(locale) {
  let registration
  let slot
  let copiedText
  const navigator = {
    language: locale,
    clipboard: { writeText: async (text) => { copiedText = text } },
  }
  const document = {
    documentElement: { lang: locale },
    querySelector: () => null,
    createElement: () => ({ setAttribute() {} }),
    head: { appendChild() {} },
  }
  const window = { __ModuleLoader__: { load(value) { registration = value } } }
  runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window, document, navigator,
  })
  const React = {
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  }
  const plugin = registration.factory((name) => {
    assert.equal(name, 'react')
    return React
  })
  plugin.apply({ slots: {
    inject(name, cb) { assert.equal(name, 'settings.plugins.tab'); cb() },
    register(spec, component) { slot = { spec, component } },
  } })
  const tree = slot.component()
  const all = []
  function visit(value) {
    if (value == null || typeof value === 'boolean') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (typeof value === 'object') {
      all.push(value)
      value.children?.forEach(visit)
    }
  }
  visit(tree)
  const text = all.flatMap(node => node.children).filter(x => typeof x === 'string')
  return {
    slot, all, text,
    get copiedText() { return copiedText },
    buttons: all.filter(node => node.type === 'button'),
  }
}

test('first-run setup card opens by default in Simplified Chinese and copies approval-first prompt', async () => {
  const ui = inspectOnboarding('zh-CN')
  assert.equal(ui.slot.spec.id, 'smart-compact')
  assert.equal(ui.slot.spec.name, 'settings.plugins.tab')
  assert.ok(ui.text.some(x => x.includes('启用独占压缩')))
  assert.ok(ui.text.some(x => x.includes('尚未检测到 Agent')))
  assert.ok(ui.text.some(x => x.includes('复制 Creator 配置指令')))
  const copy = ui.buttons.find(button => button.children.includes('复制 Creator 配置指令'))
  assert.ok(copy)
  copy.props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(ui.copiedText.includes('未经我确认之前不要写入') ||
    ui.copiedText.includes('没有确认之前不要写入'))
  assert.ok(ui.copiedText.includes('保留全部其他配置'))
  assert.ok(ui.copiedText.includes('config.auto 改为 false'))
  assert.ok(!ui.copiedText.includes('npm install'))
})

test('English onboarding is translated and never promises to rewrite a preset', async () => {
  const ui = inspectOnboarding('en-US')
  assert.ok(ui.text.some(x => x.includes('One more step')))
  assert.ok(ui.text.some(x => x.includes('Copy Creator setup prompt')))
  const copy = ui.buttons.find(button => button.children.includes('Copy Creator setup prompt'))
  copy.props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.match(ui.copiedText, /explicit approval before writing/)
  assert.match(ui.copiedText, /Preserve all other tools/)
  assert.match(ui.copiedText, /auto: false/)
  assert.ok(ui.all.some(node => node.type === 'a' &&
    node.props.href?.endsWith('/README.md')))
})

test('English and Simplified Chinese READMEs remain cross-linked and contain recovery guidance', () => {
  const en = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const zh = readFileSync(new URL('../README.zh-CN.md', import.meta.url), 'utf8')
  assert.ok(en.includes('[简体中文](./README.zh-CN.md)'))
  assert.ok(zh.includes('[English](./README.md)'))
  assert.ok(en.includes('Creator setup prompt'))
  assert.ok(zh.includes('复制 Creator 配置指令'))
  assert.ok(en.toLowerCase().includes('restore'))
  assert.ok(zh.includes('改回'))
})


test('DSH current plugin Settings UI tab contract: separate named tab, not legacy configurable card', () => {
  const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const guide = readFileSync(new URL('../README.zh-CN.md', import.meta.url), 'utf8')
  assert.match(client, /settings\.plugins\.tab/)
  assert.ok(!client.includes('settings.plugin.item'))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.ok(manifest.files.includes('lib'))
  assert.ok(guide.includes('Smart Compact'))
  assert.ok(guide.includes('内置插件'))
})
