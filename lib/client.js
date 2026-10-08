/** DSH Web client bundle: loaded by the client module loader, not Node. */
window.__ModuleLoader__.load({
  id: 'dsh-smart-compact',
  factory: (require) => {
    const React = require('react')
    const styles = `
      .dsc-wrap {display:inline-flex;align-items:center;position:relative}
      .dsc-button {height:30px;width:30px;padding:0;display:grid;place-items:center;background:transparent;border:0;border-radius:50%;color:var(--dsw-alias-label-secondary, currentColor);cursor:pointer}
      .dsc-button:hover {background:var(--dsw-alias-interactive-bg-hover,rgba(120,120,120,.12))}
      .dsc-button:focus-visible {outline:2px solid var(--dsw-alias-state-business-primary,#5a8eeb);outline-offset:2px}
      .dsc-track {fill:none;stroke:var(--dsw-alias-border-l3,#8886);stroke-width:2.4}
      .dsc-progress {fill:none;stroke:var(--dsw-alias-state-business-primary,#528de5);stroke-width:2.4;stroke-linecap:round;transition:stroke-dasharray .2s}
      .dsc-panel {position:absolute;bottom:calc(100% + 10px);right:0;z-index:100;padding:14px;width:240px;border-radius:12px;box-sizing:border-box;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#222));color:var(--dsw-alias-label-primary,white);border:1px solid var(--dsw-alias-border-l2,#7777);box-shadow:0 8px 24px #0003;font-size:12px}
      .dsc-title {font-size:14px;font-weight:600;margin-bottom:10px}
      .dsc-row {display:flex;align-items:center;justify-content:space-between;margin:8px 0;gap:8px}
      .dsc-muted {color:var(--dsw-alias-label-secondary,#999);line-height:1.5}
      .dsc-value {font-variant-numeric:tabular-nums;font-weight:600}
      .dsc-slider {width:100%;margin:6px 0;accent-color:var(--dsw-alias-state-business-primary,#528de5)}
      .dsc-save {margin-top:8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#777);background:var(--dsw-alias-interactive-bg-hover,#7772);color:inherit;padding:5px 10px;cursor:pointer}
      .dsc-save:disabled {opacity:.5;cursor:default}
      .dsc-error {color:var(--dsw-alias-state-error-primary,#e76b6b)}
    `
    if (!document.querySelector('[data-dsc-css]')) {
      const el = document.createElement('style')
      el.setAttribute('data-dsc-css', '1')
      el.textContent = styles
      document.head.appendChild(el)
    }

    const API = '/dsh-smart-compact/api/config'
    async function getConfig() {
      const response = await fetch(API, { method: 'GET', cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'settings unavailable')
      return result.config
    }
    async function setRatio(triggerRatio) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ triggerRatio }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'save failed')
      return result.config
    }

    const RADIUS = 7
    const LENGTH = 2 * Math.PI * RADIUS
    function ContextRing(props) {
      const [open, setOpen] = React.useState(false)
      const [ratio, setRatioValue] = React.useState(0.7)
      const [saved, setSaved] = React.useState(0.7)
      const [ready, setReady] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState('')
      const useProjection = props?.useProjection
      const projection = typeof useProjection === 'function' ? useProjection('contextPressure') : null
      const total = projection?.projectedTokens ?? projection?.pressureTokens
      const windowTokens = projection?.contextWindow
      const fraction = Number.isFinite(total) && Number.isFinite(windowTokens) && windowTokens > 0
        ? Math.max(0, Math.min(1, total / windowTokens)) : null
      const percent = fraction == null ? '—' : `${Math.round(fraction * 100)}%`

      React.useEffect(() => {
        let active = true
        getConfig().then((config) => {
          if (!active) return
          setRatioValue(config.triggerRatio)
          setSaved(config.triggerRatio)
          setReady(true)
          setError('')
        }).catch(() => {
          if (active) setError('设置服务不可用，自动压缩仍会按原配置运行')
        })
        return () => { active = false }
      }, [])

      async function save() {
        setSaving(true)
        setError('')
        try {
          const config = await setRatio(ratio)
          setSaved(config.triggerRatio)
          setRatioValue(config.triggerRatio)
        } catch (cause) {
          setError(cause?.message || '保存失败')
        } finally { setSaving(false) }
      }

      const progress = fraction == null ? 0 : fraction
      const line = `${(LENGTH * progress).toFixed(2)} ${LENGTH.toFixed(2)}`
      return React.createElement('span', { className: 'dsc-wrap' },
        React.createElement('button', {
          className: 'dsc-button', type: 'button',
          'aria-label': `上下文用量 ${percent}，打开自动压缩设置`,
          title: `上下文 ${percent} · 压缩阈值 ${Math.round(saved * 100)}%`,
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
        }, React.createElement('svg', { width: 21, height: 21, viewBox: '0 0 20 20', 'aria-hidden': true },
          React.createElement('circle', { className: 'dsc-track', cx: 10, cy: 10, r: RADIUS }),
          React.createElement('circle', {
            className: 'dsc-progress', cx: 10, cy: 10, r: RADIUS,
            strokeDasharray: line, transform: 'rotate(-90 10 10)',
          }),
        )),
        open && React.createElement('div', { className: 'dsc-panel', role: 'dialog', 'aria-label': '智能压缩设置' },
          React.createElement('div', { className: 'dsc-title' }, 'Smart Compact'),
          React.createElement('div', { className: 'dsc-row' },
            React.createElement('span', null, '当前上下文'),
            React.createElement('span', { className: 'dsc-value' }, percent),
          ),
          React.createElement('div', { className: 'dsc-row' },
            React.createElement('label', { htmlFor: 'dsc-threshold' }, '自动压缩阈值'),
            React.createElement('span', { className: 'dsc-value' }, `${Math.round(ratio * 100)}%`),
          ),
          React.createElement('input', {
            id: 'dsc-threshold', className: 'dsc-slider',
            type: 'range', min: 20, max: 95, step: 1,
            value: Math.round(ratio * 100), disabled: !ready || saving,
            onChange: (event) => setRatioValue(Number(event.target.value) / 100),
          }),
          React.createElement('div', { className: 'dsc-muted' }, '压缩由 DSH 原生引擎执行。设置仅在当前电脑生效。'),
          error && React.createElement('div', { className: 'dsc-error', role: 'alert' }, error),
          React.createElement('button', {
            type: 'button', className: 'dsc-save',
            disabled: !ready || saving || ratio === saved,
            onClick: save,
          }, saving ? '保存中…' : '保存设置'),
        ),
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        { name: 'conversation.input.right', id: 'dsh-smart-compact-ring', order: 15 },
        ContextRing,
      ))
    }
    return { inject, apply }
  },
})
