/**
 * DSH Smart Compact settings card.
 * The native DSH context ring remains the single source of context pressure UI.
 * No DOM patching, no duplicate circle, no interception of built-in popovers.
 */
window.__ModuleLoader__.load({
  id: 'dsh-smart-compact',
  factory: (require) => {
    const React = require('react')
    const css = [
      '.dsc-settings{list-style:none;border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-3,transparent)}',
      '.dsc-settings-toggle{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:12px 14px;border:0;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;text-align:left;cursor:pointer}',
      '.dsc-settings-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}',
      '.dsc-title{display:block;font-size:14px;font-weight:600}',
      '.dsc-subtitle,.dsc-hint{display:block;font-size:12px;color:var(--dsw-alias-label-tertiary,#888);line-height:1.6}',
      '.dsc-settings-body{padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l2,#8885)}',
      '.dsc-value{font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsc-row{display:flex;justify-content:space-between;gap:12px;align-items:center}',
      '.dsc-slider{width:100%;margin:14px 0;accent-color:var(--dsw-alias-state-business-primary,#528de5)}',
      '.dsc-save{margin-top:10px;border-radius:7px;padding:7px 12px;border:1px solid var(--dsw-alias-border-l2,#8886);background:var(--dsw-alias-interactive-bg-hover,#8882);color:var(--dsw-alias-label-primary,inherit);cursor:pointer;font:inherit}',
      '.dsc-save:disabled{opacity:.5;cursor:default}',
      '.dsc-error{color:var(--dsw-alias-state-error-primary,#d66);margin-top:8px;font-size:12px}',
    ].join('')
    if (typeof document !== 'undefined' && !document.querySelector('style[data-dsc-css]')) {
      const style = document.createElement('style')
      style.setAttribute('data-dsc-css', '1')
      style.textContent = css
      document.head.appendChild(style)
    }
    const url = '/dsh-smart-compact/api/config'
    async function request(method, body) {
      const response = await fetch(url, {
        method,
        cache: 'no-store',
        ...(body === undefined ? {} : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      })
      const data = await response.json()
      if (!response.ok || data.ok !== true) throw new Error(data.error || '设置服务不可用')
      return data.config
    }
    function SettingsCard() {
      const [open, setOpen] = React.useState(false)
      const [ready, setReady] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [ratio, setRatio] = React.useState(0.9)
      const [saved, setSaved] = React.useState(0.9)
      const [error, setError] = React.useState('')
      const [enabled, setEnabled] = React.useState(true)
      React.useEffect(() => {
        let live = true
        request('GET').then((config) => {
          if (!live) return
          setRatio(config.triggerRatio)
          setSaved(config.triggerRatio)
          setEnabled(config.enabled)
          setReady(true)
        }).catch((cause) => {
          if (live) setError(cause?.message || '无法读取自动压缩设置')
        })
        return () => { live = false }
      }, [])
      async function save() {
        setBusy(true)
        setError('')
        try {
          const config = await request('POST', { triggerRatio: ratio })
          setSaved(config.triggerRatio)
          setRatio(config.triggerRatio)
        } catch (cause) {
          setError(cause?.message || '保存失败')
        } finally {
          setBusy(false)
        }
      }
      return React.createElement('li', { className: 'dsc-settings' },
        React.createElement('button', {
          type: 'button', className: 'dsc-settings-toggle',
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
        },
          React.createElement('span', null,
            React.createElement('span', { className: 'dsc-title' }, 'Smart Compact · 自动上下文压缩'),
            React.createElement('span', { className: 'dsc-subtitle' }, '保留 DSH 原生上下文圆环；独立设置自动压缩阈值'),
          ),
          React.createElement('span', { 'aria-hidden': true }, open ? '⌃' : '⌄'),
        ),
        open && React.createElement('div', { className: 'dsc-settings-body' },
          React.createElement('div', { className: 'dsc-row' },
            React.createElement('span', null, '自动压缩触发阈值'),
            React.createElement('span', { className: 'dsc-value' }, Math.round(ratio * 100) + '%'),
          ),
          React.createElement('input', {
            type: 'range', className: 'dsc-slider',
            min: 20, max: 90, step: 1,
            value: Math.round(ratio * 100),
            disabled: !ready || busy || !enabled,
            'aria-label': '自动压缩阈值百分比',
            onChange: (event) => setRatio(Number(event.target.value) / 100),
          }),
          React.createElement('div', { className: 'dsc-hint' },
            enabled
              ? '按模型窗口计算，默认 90%；为输出预留空间时可能提前压缩。DSH 内置策略（默认约 80%）也可能更早触发。'
              : '自动压缩已由本地配置停用，请在配置文件中重新启用。',
          ),
          error && React.createElement('div', { className: 'dsc-error', role: 'alert' }, error),
          React.createElement('button', {
            type: 'button', className: 'dsc-save',
            disabled: !ready || busy || !enabled || ratio === saved,
            onClick: () => { void save() },
          }, busy ? '保存中…' : '保存阈值'),
        ),
      )
    }
    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
        { name: 'settings.plugin.item', id: 'dsh-smart-compact-settings', order: 15 },
        SettingsCard,
      ))
    }
    return { inject, apply }
  },
})
