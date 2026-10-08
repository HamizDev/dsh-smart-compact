import test from 'node:test'
import assert from 'node:assert/strict'
import {
  apply, validateConfig, contextWindowOf, triggerAtTokens,
  configPath, readConfig, DEFAULTS, routedRequestOf, modelPolicyOf,
} from '../lib/index.js'

function fakeRuntime({
  total = 94000, window = 100000, result = { summarySeq: 4 },
  engine = true, provider = 'example', model = 'model-a', reservedOutputTokens = 0,
} = {}) {
  const events = {}
  const session = {
    id: 's1',
    route: { provider, model, maxTokens: reservedOutputTokens },
    requestHeader() { return { config: this.route } },
  }
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
    logger: () => ({ info() {}, warn() {} }),
  }
  return {
    events, session, agent, calls, api,
    setTotal(n) { total = n },
    setWindow(n) { window = n },
  }
}
async function step(runtime, signal = new AbortController().signal) {
  let nextCount = 0
  await runtime.events['agent/pre-step']({ agent: runtime.agent, signal }, async () => { nextCount++ })
  return nextCount
}

test('Codex-style default scales across 32K / 128K / 256K / 1M without a fixed cap', () => {
  assert.equal(DEFAULTS.triggerRatio, 0.9)
  assert.equal(DEFAULTS.effectiveContextWindowRatio, 0.95)
  for (const window of [32000, 128000, 256000, 1000000]) {
    assert.equal(triggerAtTokens(window, DEFAULTS), Math.floor(window * 0.9))
  }
  assert.equal(triggerAtTokens(1000000, validateConfig({ maxTriggerTokens: 262144 })), 262144)
  assert.equal(triggerAtTokens(null, DEFAULTS), null)
  assert.equal(triggerAtTokens(1.2, DEFAULTS), null)
})

test('effective window and routed output reservation can trigger earlier', () => {
  const route = { provider: 'x', model: 'a', reservedOutputTokens: 12000 }
  assert.equal(triggerAtTokens(100000, DEFAULTS, route), 83000)
  assert.equal(triggerAtTokens(100000, DEFAULTS, { ...route, reservedOutputTokens: 0 }), 90000)
  assert.equal(triggerAtTokens(100000, DEFAULTS, { ...route, reservedOutputTokens: 98000 }), null)
  assert.equal(triggerAtTokens(100000, DEFAULTS, { ...route, reservedOutputTokens: -1 }), null)
})

test('per-model lower ratios and explicit token limits never increase the 90% ceiling', () => {
  const config = validateConfig({
    modelPolicies: [
      { provider: 'deepseek', model: 'small', triggerRatio: 0.75 },
      { provider: 'deepseek', model: 'large', autoCompactTokenLimit: 150000 },
      { provider: 'other', model: 'special', triggerRatio: 0.8, autoCompactTokenLimit: 60000 },
    ],
  })
  assert.equal(triggerAtTokens(100000, config, { provider: 'deepseek', model: 'small' }), 75000)
  assert.equal(triggerAtTokens(1000000, config, { provider: 'deepseek', model: 'large' }), 150000)
  assert.equal(triggerAtTokens(100000, config, { provider: 'other', model: 'special' }), 60000)
  assert.equal(triggerAtTokens(1000000, config, { provider: 'other', model: 'large' }), 900000)
  assert.equal(modelPolicyOf(config, { provider: 'deepseek', model: 'small' }).triggerRatio, 0.75)
  assert.ok(Object.isFrozen(config.modelPolicies))
  assert.ok(Object.isFrozen(config.modelPolicies[0]))
})

test('reject invalid policy configuration and duplicate targets', () => {
  assert.throws(() => validateConfig({ triggerRatio: 0.95 }), /triggerRatio/)
  assert.throws(() => validateConfig({ triggerRatio: 1 }), /triggerRatio/)
  assert.throws(() => validateConfig({ effectiveContextWindowRatio: 0.85 }), /effectiveContextWindowRatio/)
  assert.throws(() => validateConfig({ maxTriggerTokens: 1 }), /maxTriggerTokens/)
  assert.throws(() => validateConfig({ enabled: 'yes' }), /enabled/)
  assert.throws(() => validateConfig({ triggerRato: 0.3 }), /unknown configuration/)
  assert.throws(() => validateConfig({ modelPolicies: 'a' }), /modelPolicies/)
  assert.throws(() => validateConfig({ modelPolicies: [{}] }), /requires provider and model/)
  assert.throws(() => validateConfig({ modelPolicies: [{ provider: 'a', model: 'b', ratio: 0.4 }] }), /unknown key/)
  assert.throws(() => validateConfig({ modelPolicies: [{ provider: 'a', model: 'b', triggerRatio: 0.95 }] }), /triggerRatio/)
  assert.throws(() => validateConfig({ modelPolicies: [{ provider: 'a', model: 'b', autoCompactTokenLimit: -1 }] }), /autoCompactTokenLimit/)
  assert.throws(() => validateConfig({ modelPolicies: [
    { provider: 'a', model: 'b' },
    { provider: 'a', model: 'b' },
  ] }), /duplicate/)
})

test('request header parser does not guess routing or untrusted token reservations', () => {
  assert.deepEqual(routedRequestOf({
    requestHeader: () => ({ config: { provider: 'a', model: 'b', maxTokens: 6000 } }),
  }), { provider: 'a', model: 'b', reservedOutputTokens: 6000 })
  assert.equal(routedRequestOf({ requestHeader: () => ({ config: { provider: 'a' } }) }), null)
  assert.equal(routedRequestOf({ requestHeader: () => { throw new Error('oops') } }), null)
  assert.deepEqual(routedRequestOf({ requestHeader: () => ({ config: {
    provider: 'a', model: 'b', maxTokens: 'infinity',
  } }) }).reservedOutputTokens, 0)
})

test('DSH_HOME is respected; missing config uses defaults; invalid one is nonfatal', () => {
  assert.equal(configPath({ DSH_HOME: 'C:\\AltDSH' }, 'H'), 'C:\\AltDSH/smart-compact.json')
  const absent = Object.assign(new Error('missing'), { code: 'ENOENT' })
  assert.deepEqual(readConfig('x', () => { throw absent }), validateConfig(DEFAULTS))
  let warnings = 0
  assert.deepEqual(readConfig('x', () => '{ broken json', () => warnings++), validateConfig(DEFAULTS))
  assert.equal(warnings, 1)
})

test('at/above 90% calls native DSH engine and continues the step', async () => {
  const rt = fakeRuntime({ total: 90000 })
  apply(rt.api)
  assert.equal(await step(rt), 1)
  assert.equal(rt.calls.length, 1)
  assert.equal(rt.calls[0][1], 'context-overflow')
  assert.equal(rt.calls[0][0], rt.agent)
})

test('below threshold, missing capacity or excessively reserved output leaves step unchanged', async () => {
  for (const args of [
    { total: 89999, window: 100000 },
    { total: 90000, window: undefined },
    { total: 40000, window: 100000, reservedOutputTokens: 100000 },
  ]) {
    const rt = fakeRuntime(args)
    apply(rt.api)
    assert.equal(await step(rt), 1)
    assert.equal(rt.calls.length, 0)
  }
})

test('a lower configured model policy overrides global ratio for the same session', async () => {
  const rt = fakeRuntime({ total: 76000, model: 'small' })
  apply(rt.api, { modelPolicies: [
    { provider: 'example', model: 'small', triggerRatio: 0.75 },
  ] })
  assert.equal(await step(rt), 1)
  assert.equal(rt.calls.length, 1)
})

test('no-op suppresses repeated attempts until 2K growth', async () => {
  const rt = fakeRuntime({ total: 91000, result: null })
  apply(rt.api)
  await step(rt)
  await step(rt)
  assert.equal(rt.calls.length, 1)
  rt.setTotal(93049)
  await step(rt)
  assert.equal(rt.calls.length, 2)
})

test('model route or context window change reevaluates even without token growth', async () => {
  const rt = fakeRuntime({ total: 95000, result: null })
  apply(rt.api)
  await step(rt)
  await step(rt)
  assert.equal(rt.calls.length, 1)
  rt.session.route.model = 'model-b'
  await step(rt)
  assert.equal(rt.calls.length, 2)
  rt.setWindow(90000)
  await step(rt)
  assert.equal(rt.calls.length, 3)
})

test('native engine failures never block next()', async () => {
  const rt = fakeRuntime({ result: new Error('summary API failed') })
  apply(rt.api)
  assert.equal(await step(rt), 1)
  assert.equal(rt.calls.length, 1)
})

test('missing backend, aborted pre-step and disabled configuration skip compaction', async () => {
  const missing = fakeRuntime({ engine: false })
  apply(missing.api)
  assert.equal(await step(missing), 1)
  assert.equal(missing.calls.length, 0)
  const aborted = fakeRuntime()
  apply(aborted.api)
  const controller = new AbortController()
  controller.abort()
  assert.equal(await step(aborted, controller.signal), 1)
  assert.equal(aborted.calls.length, 0)
  const disabled = fakeRuntime()
  apply(disabled.api, { enabled: false })
  assert.equal(disabled.events['agent/pre-step'], undefined)
})

test('context window is read from native DSH pressure projection', () => {
  assert.equal(contextWindowOf({ sessionProjections: { snapshot: () => ({ values: {
    contextPressure: { contextWindow: 131072 },
  } }) } }, {}), 131072)
  assert.equal(contextWindowOf({ sessionProjections: { snapshot: () => { throw new Error('bad') } } }, {}), null)
})

test('same session cannot run two simultaneous compactions', async () => {
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
