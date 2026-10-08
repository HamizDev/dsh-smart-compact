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
    on(_event, fn) { this.step = fn },
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
    assert.equal((await respond('POST', { triggerRatio: 0.6 })).status, 200)
    assert.equal((await respond('GET')).body.config.triggerRatio, 0.6)
    assert.equal(JSON.parse(readFileSync(join(path, 'smart-compact.json'), 'utf8')).triggerRatio, 0.6)
    const rejected = await respond('POST', { triggerRatio: -1 })
    assert.equal(rejected.status, 400)
    assert.equal((await respond('GET')).body.config.triggerRatio, 0.6)
    await ctx.step({ agent, signal: new AbortController().signal }, async () => {})
    assert.equal(calls.length, 1, '65K tokens should trigger after changing threshold to 60%')
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
  plugin.apply({ slots: { inject(name, fn) { assert.equal(name, 'settings.plugin.item'); fn() }, register(spec) { slot = spec } } })
  assert.equal(slot.id, 'dsh-smart-compact-settings')
  assert.equal(slot.name, 'settings.plugin.item')
  assert.ok(!readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').includes('conversation.input.right'))
})
