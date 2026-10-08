/**
 * DSH Smart Compact: a non-destructive trigger policy for the built-in
 * @deepseek-ai/dsh-compaction-basic service.
 *
 * This module NEVER edits session history, calls a summarizer directly, or
 * sends a fake continuation message. All mutations belong to DSH's durable,
 * lock-protected compaction backend. Tested with mocked rc.6/alpha-style seams.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-smart-compact'
export const inject = ['agentPresets', 'tokenMeter', 'sessionProjections']

export const DEFAULTS = Object.freeze({
  enabled: true,
  exclusive: true,
  maxOverflowRetries: 1,
  triggerRatio: 0.90,
  effectiveContextWindowRatio: 0.95,
  maxTriggerTokens: null,
  retryGrowthTokens: 2048,
  modelPolicies: [],
})
const KEYS = new Set(Object.keys(DEFAULTS))
const POLICY_KEYS = new Set(['provider', 'model', 'triggerRatio', 'autoCompactTokenLimit'])

function validRatio(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function positiveLimit(value) {
  return Number.isSafeInteger(value) && value > 0
}

/** Fail closed on typos instead of silently applying surprising settings. */
export function validateConfig(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('configuration must be a JSON object')
  }
  for (const key of Object.keys(raw)) {
    if (!KEYS.has(key)) throw new TypeError(`unknown configuration key: ${key}`)
  }
  const result = { ...DEFAULTS, ...raw }
  if (typeof result.enabled !== 'boolean') throw new TypeError('enabled must be boolean')
  if (typeof result.exclusive !== 'boolean') throw new TypeError('exclusive must be boolean')
  if (!Number.isSafeInteger(result.maxOverflowRetries) || result.maxOverflowRetries < 0 || result.maxOverflowRetries > 3) {
    throw new RangeError('maxOverflowRetries must be an integer from 0 to 3')
  }
  if (!validRatio(result.triggerRatio, 0.20, 0.90)) {
    throw new RangeError('triggerRatio must be between 0.20 and 0.90')
  }
  if (!validRatio(result.effectiveContextWindowRatio, 0.90, 1.00)) {
    throw new RangeError('effectiveContextWindowRatio must be between 0.90 and 1.00')
  }
  if (result.maxTriggerTokens !== null &&
      (!positiveLimit(result.maxTriggerTokens) || result.maxTriggerTokens < 8192)) {
    throw new RangeError('maxTriggerTokens must be null or an integer >= 8192')
  }
  if (!Number.isSafeInteger(result.retryGrowthTokens) || result.retryGrowthTokens < 0) {
    throw new RangeError('retryGrowthTokens must be a non-negative integer')
  }
  if (!Array.isArray(result.modelPolicies)) {
    throw new TypeError('modelPolicies must be an array')
  }
  const targets = new Set()
  const policies = result.modelPolicies.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`modelPolicies[${index}] must be an object`)
    }
    for (const key of Object.keys(entry)) {
      if (!POLICY_KEYS.has(key)) throw new TypeError(`modelPolicies[${index}]: unknown key ${key}`)
    }
    if (typeof entry.provider !== 'string' || !entry.provider.trim()
      || typeof entry.model !== 'string' || !entry.model.trim()) {
      throw new TypeError(`modelPolicies[${index}] requires provider and model`)
    }
    const key = `${entry.provider}\u0000${entry.model}`
    if (targets.has(key)) throw new Error(`duplicate modelPolicies target: ${entry.provider}/${entry.model}`)
    targets.add(key)
    if (entry.triggerRatio !== undefined && !validRatio(entry.triggerRatio, 0.20, 0.90)) {
      throw new RangeError(`modelPolicies[${index}].triggerRatio must be 0.20–0.90`)
    }
    if (entry.autoCompactTokenLimit !== undefined && !positiveLimit(entry.autoCompactTokenLimit)) {
      throw new RangeError(`modelPolicies[${index}].autoCompactTokenLimit must be a positive integer`)
    }
    return Object.freeze({ ...entry })
  })
  // Freeze both array and entries so load-time edits cannot silently alter thresholds.
  return Object.freeze({ ...result, modelPolicies: Object.freeze(policies) })
}

/** Resolve the latest routed request, not the model name displayed by the UI. */
export function routedRequestOf(session) {
  try {
    const request = session?.requestHeader?.()?.config
    if (!request || typeof request.provider !== 'string' || typeof request.model !== 'string') return null
    return {
      provider: request.provider,
      model: request.model,
      // DSH reserves output maxTokens from the same context window.
      reservedOutputTokens: Number.isSafeInteger(request.maxTokens) && request.maxTokens >= 0
        ? request.maxTokens : 0,
    }
  } catch { return null }
}

export function modelPolicyOf(config, route) {
  if (!route) return null
  return config.modelPolicies.find((entry) =>
    entry.provider === route.provider && entry.model === route.model) ?? null
}

export function configPath(env = process.env, home = homedir()) {
  const dshHome = typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim()
    ? env.DSH_HOME.trim() : join(home, '.dsh')
  return join(dshHome, 'smart-compact.json')
}

function loadOverrides(path, read = readFileSync, warn = () => {}) {
  try {
    const raw = JSON.parse(read(path, 'utf8'))
    validateConfig(raw)
    return raw
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      warn(`invalid configuration at ${path}: ${error?.message ?? String(error)}; ignoring file overrides`)
    }
    return {}
  }
}

export function readConfig(path, read = readFileSync, warn = () => {}) {
  return validateConfig(loadOverrides(path, read, warn))
}

/** Extract the context window from the same projection DSH's UI uses. */
export function contextWindowOf(ctx, session) {
  try {
    const snapshot = ctx.sessionProjections.snapshot(session)
    const window = snapshot?.values?.contextPressure?.contextWindow
    return Number.isFinite(window) && window > 0 ? window : null
  } catch { return null }
}

/**
 * Codex-inspired pre-step trigger:
 *   min(90% of actual model capacity, lower user/model-specific limit,
 *       95% effective capacity minus the routed request's output reservation).
 * In exclusive mode the DSH backend's auto listeners are disabled in each
 * active preset; DSH still owns compression and persistence.
 */
export function triggerAtTokens(window, config, route = null) {
  if (!Number.isSafeInteger(window) || window <= 0) return null
  const policy = modelPolicyOf(config, route)
  const ratio = Math.min(0.90, config.triggerRatio, policy?.triggerRatio ?? 0.90)
  const reserved = route?.reservedOutputTokens ?? 0
  if (!Number.isSafeInteger(reserved) || reserved < 0) return null
  const effective = Math.floor(window * config.effectiveContextWindowRatio) - reserved
  if (effective <= 0) return null
  const threshold = Math.min(
    Math.floor(window * ratio),
    effective,
    config.maxTriggerTokens ?? Number.MAX_SAFE_INTEGER,
    policy?.autoCompactTokenLimit ?? Number.MAX_SAFE_INTEGER,
  )
  return threshold > 0 ? threshold : null
}

/** Only the official backend exposing auto=false can safely run exclusively. */
export function engineMode(engine) {
  if (typeof engine?.compactIfNeeded !== 'function') return 'missing'
  if (engine.config?.auto === false) return 'exclusive'
  if (engine.config?.auto === true) return 'native'
  return 'unknown'
}

/** The preset's native overflow retry limit still acts as a hard ceiling. */
export function allowedOverflowRetries(config, engine) {
  const nativeLimit = engine?.config?.maxOverflowRetries
  return Number.isSafeInteger(nativeLimit) && nativeLimit >= 0
    ? Math.min(config.maxOverflowRetries, nativeLimit)
    : config.maxOverflowRetries
}

export const CONTEXT_OVERFLOW = 'CONTEXT_WINDOW_EXCEEDED'

/**
 * Register host-plane step middleware. A WeakMap prevents repeated attempts
 * on the same unchanged, over-budget surface after a failed/no-op compaction.
 */
export function apply(ctx, rowConfig = {}) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger(name) : null
  const warn = (message) => {
    if (logger?.warn) logger.warn(message)
    else console.warn(`[${name}] ${message}`)
  }
  const info = (message) => {
    if (logger?.info) logger.info(message)
    else console.info(`[${name}] ${message}`)
  }

  // Profile row config is supported; optional DSH_HOME config overrides it.
  let fileOverrides = loadOverrides(configPath(), readFileSync, warn)
  let config
  try {
    // Only explicitly set JSON keys override the optional bundle row config.
    config = validateConfig({ ...rowConfig, ...fileOverrides })
  } catch (error) {
    warn(`invalid profile configuration: ${error?.message ?? String(error)}; ignoring profile overrides`)
    config = validateConfig(fileOverrides)
  }
  if (!config.enabled) {
    warn('plugin disabled; if native compaction-basic auto:false is set, restore auto:true before disabling Smart Compact to preserve overflow recovery')
    return
  }

  // This optional local-only route backs the Plugins settings card.
  // If DSH's web carrier is unavailable, host compaction still runs.
  function saveTriggerRatio(nextRatio) {
    const updated = validateConfig({ ...config, triggerRatio: nextRatio })
    const overrides = { ...fileOverrides, triggerRatio: nextRatio }
    const path = configPath()
    const tmp = `${path}.${process.pid}.tmp`
    mkdirSync(dirname(path), { recursive: true })
    try {
      writeFileSync(tmp, `${JSON.stringify(overrides, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      renameSync(tmp, path)
    } catch (error) {
      try { unlinkSync(tmp) } catch {}  // best-effort cleanup
      throw error
    }
    fileOverrides = overrides
    config = updated
    return config
  }
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['webServer'], (webCtx) => webCtx.effect(() =>
        webCtx.webServer.register({
          kind: 'exact',
          path: '/dsh-smart-compact/api/config',
          handler: async (req, res) => {
            const json = (status, value) => {
              res.writeHead(status, {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
                'x-content-type-options': 'nosniff',
              })
              res.end(JSON.stringify(value))
            }
            if (!isTrustedLocalRequest(req)) return json(403, { ok: false, error: 'local same-origin requests only' })
            if (req.method === 'GET') return json(200, { ok: true, config: { ...config } })
            if (req.method !== 'POST') return json(405, { ok: false, error: 'method not allowed' })
            if (!(req.headers?.['content-type'] ?? '').startsWith('application/json')) {
              return json(415, { ok: false, error: 'application/json required' })
            }
            try {
              const payload = await parseJsonBody(req)
              if (Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'triggerRatio')) {
                return json(400, { ok: false, error: 'only triggerRatio can be updated' })
              }
              const updated = saveTriggerRatio(payload.triggerRatio)
              return json(200, { ok: true, config: { ...updated } })
            } catch (error) {
              warn(`config update rejected: ${error?.message ?? String(error)}`)
              return json(400, { ok: false, error: error?.message ?? 'invalid request' })
            }
          },
        }), 'dsh-smart-compact: local settings endpoint'))
    }
  } catch (error) {
    warn(`optional settings route unavailable: ${error?.message ?? String(error)}`)
  }

  const lastAttempt = new WeakMap()
  const inFlight = new WeakSet()
  const warned = new WeakSet()
  const warnedNative = new WeakSet()
  const overflowRetries = new WeakMap()
  const overflowAgents = new WeakMap()

  const engineFor = (agent) => {
    try { return ctx.agentPresets.serviceFor(agent, 'compaction') }
    catch (error) { warn(`cannot resolve compaction engine: ${error?.message ?? String(error)}`); return null }
  }
  const exclusiveEngine = (agent) => {
    const engine = engineFor(agent)
    if (!config.exclusive) return typeof engine?.compactIfNeeded === 'function' ? engine : null
    return engineMode(engine) === 'exclusive' ? engine : null
  }

  const check = async (agent, signal) => {
    const session = agent?.session
    if (!session || signal?.aborted || inFlight.has(session)) return
    const engine = exclusiveEngine(agent)
    if (!engine) {
      if (!warnedNative.has(session)) {
        const reason = engineMode(engineFor(agent))
        warn(`exclusive compaction inactive (${reason}); set compaction-basic config.auto:false in this session's Agent Preset; native automatic safety remains active until then`)
        warnedNative.add(session)
      }
      return
    }
    const window = contextWindowOf(ctx, session)
    const route = routedRequestOf(session)
    const threshold = triggerAtTokens(window, config, route)
    if (threshold === null) {
      if (!warned.has(session)) {
        warn('no valid contextWindow projection; proactive compaction skipped (overflow recovery remains available)')
        warned.add(session)
      }
      return
    }
    let total
    try { total = ctx.tokenMeter.measure(session)?.totalTokens } catch (error) {
      if (!warned.has(session)) {
        warn(`token measurement failed: ${error?.message ?? String(error)}`)
        warned.add(session)
      }
      return
    }
    if (!Number.isFinite(total) || total < threshold) return

    const prev = lastAttempt.get(session)
    const routeKey = route ? `${route.provider}\u0000${route.model}` : ''
    if (prev && prev.routeKey === routeKey && total <= prev.total + config.retryGrowthTokens && prev.threshold === threshold) return
    // Record the attempt before awaiting. A no-op/error never spins on an
    // unchanged surface; growth by retryGrowthTokens allows a later retry.
    inFlight.add(session)
    lastAttempt.set(session, { total, threshold, routeKey })
    try {
      const safeSignal = signal ?? new AbortController().signal
      const result = await engine.compactIfNeeded(agent, 'pressure', safeSignal)
      if (result) info(`compacted at ${total}/${window} tokens (trigger ${threshold})`)
      else warn(`engine declined compaction at ${total} tokens; will retry after context growth`)
    } catch (error) {
      warn(`compaction failed (history preserved by DSH): ${error?.message ?? String(error)}`)
    } finally {
      inFlight.delete(session)
    }
  }

  // pre-step is DSH's serialized waterfall event, before the next LLM call.
  // Always call next even if compaction fails, so the current turn continues.
  ctx.on('agent/pre-step', async (event, next) => {
    try { await check(event?.agent, event?.signal) }
    catch (error) { warn(`unexpected check error: ${error?.message ?? String(error)}`) }
    return next()
  })
  // Native compaction-basic registers BOTH pressure and overflow callbacks
  // when auto=true. With auto=false, our plugin must handle canonical overflow
  // explicitly to avoid losing the normal retry path.
  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle' && agent) overflowRetries.delete(agent)
  })
  ctx.on('session/event', (session, event) => {
    if (event?.type !== 'assistant/message') return
    const agent = overflowAgents.get(session)
    if (agent) overflowRetries.delete(agent)
  })
  ctx.on('agent/request-error', async ({ agent, failure, signal }, next) => {
    const session = agent?.session
    if (!session || failure?.code !== CONTEXT_OVERFLOW || signal?.aborted) return next()
    const engine = exclusiveEngine(agent)
    if (!engine) return next() // native listener handles this if still auto=true
    if (!routedRequestOf(session)) return next()
    overflowAgents.set(session, agent)
    const retries = overflowRetries.get(agent) ?? 0
    if (retries >= allowedOverflowRetries(config, engine)) return next()
    const before = session.surface?.replaceGeneration
    if (!Number.isSafeInteger(before)) return next() // never retry without durable evidence
    try {
      await engine.compactIfNeeded(agent, 'context-overflow', signal ?? new AbortController().signal)
    } catch (error) {
      warn(`overflow compaction error: ${error?.message ?? String(error)}`)
      // Some safe pruning can have already committed before summary failure.
    }
    if (signal?.aborted || session.surface?.replaceGeneration <= before) return next()
    overflowRetries.set(agent, retries + 1)
    info(`recovered context overflow from durable surface update (retry ${retries + 1})`)
    return { kind: 'retry' }
  })
  info(`enabled: ${config.exclusive ? 'exclusive' : 'coexist'} Codex-style ${Math.round(config.triggerRatio * 100)}% window, effectiveWindow=${Math.round(config.effectiveContextWindowRatio * 100)}%, native auto must be false in active preset for exclusive control`)
}

/** Guard plugin-local configuration even when the DSH web app is exposed. */
export function isTrustedLocalRequest(req) {
  try {
    const headers = req?.headers ?? {}
    const host = new URL(`http://${headers.host}`)
    const hostname = host.hostname.toLowerCase()
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return false
    if (headers['sec-fetch-site'] === 'cross-site') return false
    const origin = headers.origin
    if (origin && new URL(origin).host !== host.host) return false
    const remote = req?.socket?.remoteAddress
    if (remote && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return false
    return true
  } catch { return false }
}

async function parseJsonBody(req) {
  let text = ''
  for await (const chunk of req) {
    text += chunk.toString('utf8')
    if (text.length > 2048) throw new RangeError('body too large')
  }
  const result = JSON.parse(text)
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('JSON object required')
  }
  return result
}
