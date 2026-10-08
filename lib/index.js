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
 * The DSH backend retains authority to compact earlier on its own pressure
 * threshold (usually 80%, with a further 65K headroom by default).
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
    info('disabled via configuration')
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

  const check = async (agent, signal) => {
    const session = agent?.session
    if (!session || signal?.aborted || inFlight.has(session)) return
    const window = contextWindowOf(ctx, session)
    const route = routedRequestOf(session)
    const threshold = triggerAtTokens(window, config, route)
    if (threshold === null) {
      if (!warned.has(session)) {
        warn('no valid contextWindow projection; leaving DSH built-in auto-compaction in charge')
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
    const engine = ctx.agentPresets.serviceFor(agent, 'compaction')
    if (typeof engine?.compactIfNeeded !== 'function') {
      if (!warned.has(session)) {
        warn('no compaction backend for this agent preset; skipping')
        warned.add(session)
      }
      return
    }

    // Record the attempt before awaiting. A no-op/error never spins on an
    // unchanged surface; growth by retryGrowthTokens allows a later retry.
    inFlight.add(session)
    lastAttempt.set(session, { total, threshold, routeKey })
    try {
      const safeSignal = signal ?? new AbortController().signal
      const result = await engine.compactIfNeeded(agent, 'context-overflow', safeSignal)
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
  info(`enabled: Codex-style ${Math.round(config.triggerRatio * 100)}% model window, effectiveWindow=${Math.round(config.effectiveContextWindowRatio * 100)}%, cap=${config.maxTriggerTokens ?? 'off'} tokens; DSH native compaction may run earlier`)
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
