/**
 * Onboarding + ratio controls. Never alters a preset automatically and never
 * injects a second context ring. The DSH Preset editor is read-only; Creator
 * owns any change and must ask for user approval.
 */
window.__ModuleLoader__.load({
  id: 'dsh-smart-compact',
  factory: (require) => {
    const React = require('react')
    const styleSource = [
      '.dsc-settings{list-style:none;border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-3,transparent)}',
      '.dsc-settings-toggle{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:12px 14px;border:0;background:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;text-align:left;cursor:pointer}',
      '.dsc-settings-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}',
      '.dsc-title{display:block;font-size:14px;font-weight:600}',
      '.dsc-subtitle,.dsc-hint{display:block;font-size:12px;color:var(--dsw-alias-label-tertiary,#888);line-height:1.6}',
      '.dsc-settings-body{padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l2,#8885)}',
      '.dsc-heading{font-size:13px;font-weight:600;margin-bottom:5px}',
      '.dsc-value{font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsc-row{display:flex;justify-content:space-between;gap:12px;align-items:center}',
      '.dsc-slider{width:100%;margin:10px 0;accent-color:var(--dsw-alias-state-business-primary,#528de5)}',
      '.dsc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
      '.dsc-button{border-radius:7px;padding:7px 12px;border:1px solid var(--dsw-alias-border-l2,#8886);background:var(--dsw-alias-interactive-bg-hover,#8882);color:var(--dsw-alias-label-primary,inherit);cursor:pointer;font:inherit;font-size:12px}',
      '.dsc-button:disabled{opacity:.5;cursor:default}',
      '.dsc-guide{border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:8px;padding:11px;margin-bottom:12px}',
      '.dsc-steps{padding-left:20px;margin:6px 0;color:var(--dsw-alias-label-secondary,inherit);font-size:12px;line-height:1.75}',
      '.dsc-link{font-size:12px;color:var(--dsw-alias-label-link,#4989e8);text-decoration:underline}',
      '.dsc-status{font-size:12px;line-height:1.6;margin:6px 0}',
      '.dsc-error{color:var(--dsw-alias-state-error-primary,#d66);margin-top:8px;font-size:12px}',
    ].join('')
    if (typeof document !== 'undefined' && !document.querySelector('style[data-dsc-css]')) {
      const style = document.createElement('style')
      style.setAttribute('data-dsc-css','1')
      style.textContent = styleSource
      document.head.appendChild(style)
    }
    const browserLocale = typeof document !== 'undefined'
      ? (document.documentElement?.lang || (typeof navigator !== 'undefined' ? navigator.language : 'en'))
      : 'en'
    const isZh = /^zh(?:-|$)/i.test(browserLocale)
    const translations = {
      zh: {
        title: 'Smart Compact · 自动上下文压缩',
        subtitle: '首次安装引导 · 保留 DSH 原生圆环',
        guideTitle: '启用独占压缩还差一步',
        ready: '最近检测的 Agent 已启用 Smart Compact 独占模式（原生 auto:false）。',
        native: '最近检测的 Agent 仍在使用 DSH 原生自动压缩（auto:true），Smart Compact 已主动让路。',
        missing: '最近检测的 Agent 没有可用的原生压缩引擎，请检查该 Preset。',
        unknown: '最近检测的引擎状态无法确认；不会自动修改 Preset。',
        pending: '尚未检测到 Agent。请先启动一次该 Preset 的对话，再刷新状态。',
        mixed: '目前使用兼容共存模式；如需独占，请在本地配置中启用 exclusive:true。',
        steps: [
          '在 DSH 中进入 Creator（创造模式）。',
          '点击“复制 Creator 配置指令”，将文字粘贴到 Creator 对话。',
          '让 Creator 先检查并展示差异、备份配置；确认后再应用。',
          '使用修改后的 Preset 新建会话，再返回此处刷新状态。',
        ],
        copy: '复制 Creator 配置指令',
        copied: '指令已复制，请粘贴到 DSH 的 Creator 对话',
        copyFailed: '复制失败。请从 README 手动复制配置指令。',
        refresh: '刷新检测状态',
        refreshing: '检测中…',
        ratio: '自动压缩阈值',
        save: '保存阈值',
        saving: '保存中…',
        disabled: '插件已停用：恢复原生 auto:true 后才能安全停用独占模式。',
        hint: '动态按当前模型的上下文窗口计算，默认 90%；显式输出预留可能使其提前压缩。',
        docs: '阅读中文配置说明',
        errorLoad: '读取 Smart Compact 设置失败',
        errorSave: '保存设置失败',
      },
      en: {
        title: 'Smart Compact · Automatic context compaction',
        subtitle: 'First-run setup · Keeps DSH native context meter',
        guideTitle: 'One more step to enable exclusive mode',
        ready: 'The last observed Agent has Smart Compact in exclusive mode (native auto:false).',
        native: 'The last observed Agent is still using native DSH auto compaction (auto:true); Smart Compact defers.',
        missing: 'The last observed Agent has no available compaction backend. Check that Preset.',
        unknown: 'Native engine mode could not be verified; no Preset will be changed automatically.',
        pending: 'No Agent observed yet. Start a conversation with the target Preset, then refresh.',
        mixed: 'Compatibility coexistence mode is active; use exclusive:true locally for exclusive control.',
        steps: [
          'Switch to DSH Creator mode.',
          'Click “Copy Creator setup prompt” and paste it into Creator.',
          'Have Creator inspect, back up and show a diff; approve before applying.',
          'Start a new session with the updated Preset and refresh the status here.',
        ],
        copy: 'Copy Creator setup prompt',
        copied: 'Prompt copied. Paste it into a DSH Creator conversation.',
        copyFailed: 'Clipboard unavailable. Copy the setup prompt from the README instead.',
        refresh: 'Refresh status',
        refreshing: 'Refreshing…',
        ratio: 'Automatic compaction threshold',
        save: 'Save threshold',
        saving: 'Saving…',
        disabled: 'Smart Compact is disabled. Restore native auto:true before disabling exclusive mode.',
        hint: 'Scales with the current model context window; default 90%. Explicit output reservation may lower the trigger.',
        docs: 'Read English setup guide',
        errorLoad: 'Unable to load Smart Compact settings',
        errorSave: 'Failed to save settings',
      },
    }
    const t = isZh ? translations.zh : translations.en
    const guidePrompt = isZh
      ? [
        '请协助配置 DSH Smart Compact v0.4.1 的独占自动压缩模式。',
        '1. 只读检查我当前 DSH Desktop Profile 和目标 Agent Preset 的有效配置，检查 Smart Compact 是否加载及版本。',
        '2. 找到目标 Preset 内的 compaction 分组，确认 @deepseek-ai/dsh-compaction-basic 存在且启用；仅计划将其 config.auto 改为 false。',
        '3. 保留全部其他配置：工具、权限、模型、其他插件、tool-result-pruner、command-compact、其它 compaction-basic 配置。',
        '4. 先备份受影响的配置，并完整展示差异、影响范围、回退方法，明确征求我的确认；没有确认之前不要写入。',
        '5. 只有在支持的 Creator/Bundle/Preset 管理接口能够安全实施时才修改；不要根据固定文件路径猜测，也不要覆盖整个 Preset。',
        '6. 不要修改 DSH 官方源码或其他 Preset，不要卸载 compaction-basic。',
        '7. 修改后验证新会话内 engine.config.auto === false、Smart Compact 独占策略生效、/compact 仍可用、溢出恢复保持可用。',
        '8. 如果版本不兼容、无法准确读取当前 Preset、无法保全其他配置或无法安全回退，停止并解释原因。',
      ].join('\n')
      : [
        'Help me safely configure DSH Smart Compact v0.4.1 exclusive auto-compaction.',
        '1. Read-only inspect the active DSH Desktop Profile and target Agent Preset. Verify Smart Compact is loaded and its version.',
        '2. Locate the preset compaction group and its enabled @deepseek-ai/dsh-compaction-basic entry. Plan only config.auto: false.',
        '3. Preserve all other tools, permissions, models, plugins, tool-result-pruner, command-compact, and existing compaction-basic config.',
        '4. First back up affected configuration, show the complete diff, impact and rollback plan, and request explicit approval before writing anything.',
        '5. Apply only through supported Creator/Bundle/Preset tools; never guess filesystem paths or replace an entire Preset.',
        '6. Never modify official DSH code or unrelated Presets; do not uninstall compaction-basic.',
        '7. In a new session verify native engine.config.auto === false, Smart Compact exclusive mode, /compact, and bounded overflow recovery.',
        '8. If inspection, compatibility, safe preservation, or rollback is unavailable, stop and explain the blocker.',
      ].join('\n')
    const endpoint = '/dsh-smart-compact/api/config'
    async function request(method, body) {
      const response = await fetch(endpoint, {
        method, cache: 'no-store',
        ...(body === undefined ? {} : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      })
      const data = await response.json()
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Settings backend unavailable')
      return data
    }
    function SettingsCard() {
      const [open, setOpen] = React.useState(true)
      const [ready, setReady] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [refreshing, setRefreshing] = React.useState(false)
      const [ratio, setRatio] = React.useState(0.9)
      const [saved, setSaved] = React.useState(0.9)
      const [enabled, setEnabled] = React.useState(true)
      const [exclusive, setExclusive] = React.useState(true)
      const [mode, setMode] = React.useState('not-observed')
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      React.useEffect(() => {
        let live = true
        request('GET').then((data) => {
          if (!live) return
          setRatio(data.config.triggerRatio)
          setSaved(data.config.triggerRatio)
          setEnabled(data.config.enabled)
          setExclusive(data.config.exclusive)
          setMode(data.setup?.mode || 'not-observed')
          setReady(true)
        }).catch((cause) => {
          if (live) setError(cause?.message || t.errorLoad)
        })
        return () => { live = false }
      }, [])
      async function refresh() {
        setRefreshing(true); setError('')
        try {
          const data = await request('GET')
          setMode(data.setup?.mode || 'not-observed')
          setEnabled(data.config.enabled)
          setExclusive(data.config.exclusive)
        } catch (cause) {
          setError(cause?.message || t.errorLoad)
        } finally { setRefreshing(false) }
      }
      async function copyPrompt() {
        setNotice(''); setError('')
        try {
          if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error(t.copyFailed)
          await navigator.clipboard.writeText(guidePrompt)
          setNotice(t.copied)
        } catch (_) { setError(t.copyFailed) }
      }
      async function save() {
        setBusy(true); setError(''); setNotice('')
        try {
          const data = await request('POST', { triggerRatio: ratio })
          setSaved(data.config.triggerRatio)
          setRatio(data.config.triggerRatio)
        } catch (cause) { setError(cause?.message || t.errorSave) }
        finally { setBusy(false) }
      }
      const status = !enabled ? t.disabled :
        !exclusive ? t.mixed :
        mode === 'exclusive' ? t.ready :
        mode === 'native' ? t.native :
        mode === 'missing' ? t.missing :
        mode === 'unknown' ? t.unknown : t.pending
      return React.createElement('section', { className: 'dsc-settings' },
        React.createElement('button', {
          type: 'button', className: 'dsc-settings-toggle',
          'aria-expanded': open, onClick: () => setOpen(value => !value),
        },
          React.createElement('span', null,
            React.createElement('span', { className: 'dsc-title' }, t.title),
            React.createElement('span', { className: 'dsc-subtitle' }, t.subtitle),
          ),
          React.createElement('span', { 'aria-hidden': true }, open ? '⌃' : '⌄'),
        ),
        open && React.createElement('div', { className: 'dsc-settings-body' },
          React.createElement('div', { className: 'dsc-guide' },
            React.createElement('div', { className: 'dsc-heading' }, t.guideTitle),
            React.createElement('div', { className: 'dsc-status', role: 'status' }, status),
            mode !== 'exclusive' && React.createElement('ol', { className: 'dsc-steps' },
              ...t.steps.map((step, i) => React.createElement('li', { key: i }, step)),
            ),
            React.createElement('div', { className: 'dsc-actions' },
              mode !== 'exclusive' && React.createElement('button', {
                type: 'button', className: 'dsc-button', onClick: () => { void copyPrompt() },
              }, t.copy),
              React.createElement('button', {
                type: 'button', className: 'dsc-button', disabled: refreshing,
                onClick: () => { void refresh() },
              }, refreshing ? t.refreshing : t.refresh),
            ),
            React.createElement('a', {
              className: 'dsc-link',
              href: isZh ? 'https://github.com/HamizDev/dsh-smart-compact/blob/main/README.zh-CN.md'
                : 'https://github.com/HamizDev/dsh-smart-compact/blob/main/README.md',
              target: '_blank', rel: 'noopener noreferrer',
            }, t.docs),
          ),
          React.createElement('div', { className: 'dsc-row' },
            React.createElement('span', null, t.ratio),
            React.createElement('span', { className: 'dsc-value' }, Math.round(ratio * 100) + '%'),
          ),
          React.createElement('input', {
            type: 'range', className: 'dsc-slider',
            min: 20, max: 90, step: 1, value: Math.round(ratio * 100),
            disabled: !ready || busy || !enabled,
            'aria-label': t.ratio,
            onChange: (event) => setRatio(Number(event.target.value) / 100),
          }),
          React.createElement('div', { className: 'dsc-hint' }, t.hint),
          error && React.createElement('div', { className: 'dsc-error', role: 'alert' }, error),
          notice && React.createElement('div', { className: 'dsc-hint', role: 'status' }, notice),
          React.createElement('button', {
            type: 'button', className: 'dsc-button',
            disabled: !ready || busy || !enabled || ratio === saved,
            onClick: () => { void save() },
          }, busy ? t.saving : t.save),
        ),
      )
    }
    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register(
        { name: 'settings.plugins.tab', id: 'smart-compact', order: 20, label: 'Smart Compact' },
        SettingsCard,
      ))
    }
    return { inject, apply }
  },
})
