import test from 'node:test'
import assert from 'node:assert/strict'
import {
  apply, validateConfig, contextWindowOf, triggerAtTokens,
  configPath, readConfig, DEFAULTS,
} from '../lib/index.js'

function fakeRuntime({ total = 75000, window = 100000, result = { summarySeq: 4 }, engine = true } = {}) {
  const events = {}
  const session = { id: 's1' }
  const agent = { session, id: 'a1' }
  const calls = []
  const api = {
    agentPresets: { serviceFor: () => engine ? { compactIfNeeded: async (...args) => {
      calls.push(args)
      if (result instanceof Error) throw result
      return result
    } } : null },
    tokenMeter: { measure: () => ({ totalTokens: total }) },
    sessionProjections: { snapshot: () => ({ values: { contextPressure: { contextWindow: window } } }) },
    on: (name, fn) => { events[name] = fn },
    logger: () => ({ info: () => {}, warn: () => {} }),
  }
  return { events, session, agent, calls, api, setTotal(n) { total = n } }
}
async function step(runtime, signal = new AbortController().signal) {
  let nextCount = 0
  await runtime.events['agent/pre-step']({ agent: runtime.agent, signal }, async () => { nextCount++ })
  return nextCount
}

test('defaults, threshold cap and custom config are correct', () => {
  assert.equal(DEFAULTS.triggerRatio, 0.7)
  assert.equal(triggerAtTokens(100000, DEFAULTS), 70000)
  assert.equal(triggerAtTokens(1000000, DEFAULTS), 262144)
  assert.equal(triggerAtTokens(1000000, validateConfig({ maxTriggerTokens: null })), 700000)
  assert.equal(triggerAtTokens(null, DEFAULTS), null)
  assert.equal(validateConfig({ triggerRatio: 0.6 }).triggerRatio, 0.6)
  assert.throws(() => validateConfig({ triggerRato: 0.3 }), /unknown configuration/)
  assert.throws(() => validateConfig({ triggerRatio: 1 }), /triggerRatio/)
  assert.throws(() => validateConfig({ maxTriggerTokens: 1 }), /maxTriggerTokens/)
  assert.throws(() => validateConfig({ enabled: 'yes' }), /enabled/)
})

test('DSH_HOME is respected; missing config uses defaults; invalid one is nonfatal', () => {
  assert.equal(configPath({ DSH_HOME: 'C:\\AltDSH' }, 'H'), 'C:\\AltDSH/smart-compact.json')
  const absent = Object.assign(new Error('missing'), { code: 'ENOENT' })
  assert.deepEqual(readConfig('x', () => { throw absent }), DEFAULTS)
  let warnings = 0
  assert.deepEqual(readConfig('x', () => '{ broken json', () => warnings++), DEFAULTS)
  assert.equal(warnings, 1)
})

test('at/above threshold runs native engine and continues the step', async () => {
  const rt = fakeRuntime()
  apply(rt.api)
  assert.equal(await step(rt), 1)
  assert.equal(rt.calls.length, 1)
  assert.equal(rt.calls[0][1], 'context-overflow')
  assert.equal(rt.calls[0][0], rt.agent)
})

test('below threshold and missing capacity do not compact', async () => {
  for (const window of [100000, undefined]) {
    const rt = fakeRuntime({ total: 30000, window })
    apply(rt.api)
    assert.equal(await step(rt), 1)
    assert.equal(rt.calls.length, 0)
  }
})

test('no-op suppresses a redundant retry until context has grown', async () => {
  const rt = fakeRuntime({ result: null })
  apply(rt.api)
  await step(rt)
  await step(rt)
  assert.equal(rt.calls.length, 1)
  rt.setTotal(78000)
  await step(rt)
  assert.equal(rt.calls.length, 2)
})

test('native compaction failure does not block next()', async () => {
  const rt = fakeRuntime({ result: new Error('summary API failed') })
  apply(rt.api)
  assert.equal(await step(rt), 1)
  assert.equal(rt.calls.length, 1)
})

test('missing backend safely passes through', async () => {
  const rt = fakeRuntime({ engine: false })
  apply(rt.api)
  assert.equal(await step(rt), 1)
  assert.equal(rt.calls.length, 0)
})

test('aborted step does not trigger compaction, and still propagates next', async () => {
  const rt = fakeRuntime()
  apply(rt.api)
  const controller = new AbortController()
  controller.abort()
  assert.equal(await step(rt, controller.signal), 1)
  assert.equal(rt.calls.length, 0)
})

test('context window reads only trusted projection field', () => {
  assert.equal(contextWindowOf({ sessionProjections: { snapshot: () => ({ values: { contextPressure: { contextWindow: 131072 } } }) } }, {}), 131072)
  assert.equal(contextWindowOf({ sessionProjections: { snapshot: () => { throw new Error('bad') } } }, {}), null)
})

test('disabled profile row does not register a middleware', () => {
  const rt = fakeRuntime()
  apply(rt.api, { enabled: false })
  assert.equal(rt.events['agent/pre-step'], undefined)
})

test('same session with two simultaneous step checks starts one compact', async () => {
  const rt = fakeRuntime()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let callCount = 0
  rt.api.agentPresets.serviceFor = () => ({ compactIfNeeded: async () => {
    callCount++
    await gate
    return null
  } })
  apply(rt.api)
  const first = step(rt)
  const second = step(rt)
  release()
  assert.equal(await first, 1)
  assert.equal(await second, 1)
  assert.equal(callCount, 1)
})
