# DSH Smart Compact v0.4.2

**语言：** [English](./README.md) | 简体中文

面向 DeepSeek Harness（DSH）的 **Codex 风格独占自动压缩控制器**。插件决定自动压缩时机；官方 `compaction-basic` 负责真正的摘要、会话持久化、工具调用配对和手动 `/compact`。

## 安装后怎么启用？（v0.4.1）

1. 使用下方命令安装或升级，**彻底退出并重启 DSH Desktop**。
2. 打开 **设置 → 内置插件 → Smart Compact 标签页**。Smart Compact 独立标签页中的引导面板会默认展开，提示你完成独占模式配置，同时展示**最近一次检测到的 Agent** 的原生压缩状态。
3. 点击 **「复制 Creator 配置指令」**，在 DSH 内进入 **Creator / 创造模式** 并粘贴。
4. Creator 必须先核对当前 Preset、备份、展示配置差异与回退方法，**经过你明确确认后** 才能安全应用。
5. 用修改后的 Preset 新建会话，再返回此处点击 **「刷新检测状态」**。确认最近检测的 Agent 显示 `auto:false`，并分别验收 `/compact` 和自动溢出恢复。

> 为什么不是安装即“一键改好”？DSH 当前官方 Preset 配置查看器主要是**只读**，不同用户可能自定义了工具、权限和插件。直接重写整份 Preset 会存在破坏配置的风险。所以插件提供**一键复制完整 Creator 指令**，而不是未经确认地覆盖 Preset。

**提示的范围：** 安装后首次打开插件设置卡片时会看到引导（不是一个全局弹窗）。如果所用 DSH Desktop 版本未提供设置卡片插槽或本地设置服务，请按此 README 里的步骤手动配置。检测状态只针对**最近观察到的 Agent**，不代表全部 Preset 均已配置。

## 可直接复制的 Creator 配置指令

```text
请为 DSH Desktop 配置 Smart Compact 独占自动压缩。
先只读核对当前 Desktop Profile 和目标 Agent Preset，备份相关配置并展示完整差异。
在目标 Preset 内保留 @deepseek-ai/dsh-compaction-basic，只计划将 config.auto 设置为 false；
保留其它所有模型、工具、权限、插件、tool-result-pruner、command-compact 和原生配置。
先给我审阅修改差异和回退步骤，未经我确认不能实际修改。
只通过 DSH 当前支持的 Creator/Bundle/Preset 操作方式执行，不能猜文件路径、覆盖整个 Preset 或修改官方源码。
修改后用新会话确认 Smart Compact 正在接管自动压缩，且 /compact 与溢出恢复可用。
如果无法安全检查或应用，停止并说明原因。
```

## 如何真正让 Smart Compact 单独控制压缩？

**不能直接卸载或停用原生 `compaction-basic`！** DSH Desktop 的 `compaction-basic` 位于每个 Agent Preset 的 `compaction` 分组中，而非单独的 Host 行。简单修改 Host 配置不起作用，且修改一个 Preset 的整套插件清单可能覆盖你当前的其他定制功能。插件不会擅自重写 Preset。

请按顺序操作：

1. 安装或更新 Smart Compact 到 **v0.4.2**。
2. 备份当前 Agent Preset 的配置。
3. 在 DSH 的 Agent Preset 编辑流程中，编辑**当前会话使用的 Preset**（例如 `standard` / `cordis` / `ptc`，或建立一个自定义 Preset）。
4. 找到 Preset 内的 `compaction` 分组，**保留启用的** `@deepseek-ai/dsh-compaction-basic`，仅给它设置 `auto: false`。之前的其他设置也必须保留。
5. 重启 DSH，使用修改后的 Preset 创建新会话并验证日志。已运行会话可能仍绑定旧版 Preset。
6. 验证 `/compact` 仍可用，并通过较长的会话测试自动压缩和溢出恢复。

示意片段（**不可拿这个片段替换整个 Preset**）：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
      config:
        auto: false
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
    # 保留原本的 pruner、其他子插件和整个 Preset 的所有内容
```

**只调整原生引擎的自动监听器，不关闭引擎**。关闭原生 `auto` 会同时停止原生的提前压缩和溢出重试，所以 v0.4.1 还独立接管了标准上下文溢出后的受限重试。

### 运行逻辑

- **原生仍 `auto: true`**：Smart Compact 检测到后自动让路，不会与原生 80% 策略重复竞争。
- **确认原生 `auto: false`**：Smart Compact 的 Codex 风格阈值接管主动检测，调用原生 `compactIfNeeded(agent, 'pressure', signal)`，保留近期历史的原生策略。
- **无法确认引擎状态**：安全旁路并记录警告，不盲目停用原生机制。
- **真溢出**（错误码 `CONTEXT_WINDOW_EXCEEDED`）：最多重试一次（可配置），且仅当会话表层的持久修订号已推进才执行重试。无修改、取消、非溢出错误一律保留原错误。
- **手动压缩**：DSH 自带的 `/compact` 不变。
- **界面**：直接使用 DSH 原生 Token 圆环；阈值在「设置 → 内置插件 → Smart Compact 标签页」调整。

如果将来**停用或卸载 Smart Compact**，请先把各 Preset 中的原生 `compaction-basic config.auto` **改回 `true`**，否则会失去原生自动压缩和溢出恢复。

## 阈值

默认按当前模型上下文窗口 **90%** 自动触发，另设 95% 有效窗口保护以及显式输出 Token 预留：

```text
触发阈值 = min(
  模型上下文窗口 × 90%,
  模型上下文窗口 × 95% − 已声明的输出预留,
  可选全局 Token 上限,
  可选单模型 Token 上限
)
```

真实触发还受原生引擎的保留策略和模型参数影响；32K/128K/256K/1M 自动跟随。模型窗口不明时不猜测，仍可在实际溢出后走官方引擎的恢复分支。

## Windows 安装

彻底退出 DSH Desktop，然后用 DSH Desktop 自带的命令：

```powershell
dsh plugin --profile desktop add github:HamizDev/dsh-smart-compact
```

重启并确认安装版本为 0.4.2。修改 Preset 后，建议新建一个使用该 Preset 的会话验收。不要用独立 npm/npx 的 DSH CLI 修改受保护的 Desktop Profile。

插件本身的配置文件在 `~/.dsh/smart-compact.json`（或自定义 `$DSH_HOME`）：

```json
{
  "enabled": true,
  "exclusive": true,
  "maxOverflowRetries": 1,
  "triggerRatio": 0.9,
  "effectiveContextWindowRatio": 0.95,
  "maxTriggerTokens": null,
  "retryGrowthTokens": 2048,
  "modelPolicies": []
}
```

`exclusive:false` 仅用于明确希望两套监听器共存的兼容模式，不推荐。原生的 `maxOverflowRetries` 如配置更低值，本插件会尊重它。旧文件里的 70% 或 262144 Token 上限不会被升级覆盖，要自行清理。

```powershell
npm run check
```

**注意：左侧导航的「插件」是插件管理器，主要显示已安装和运行状态；此处的引导位于独立的「设置 → 内置插件 → Smart Compact」标签页，二者不是同一个页面。**

以上测试使用 DSH 的模拟回调与压缩引擎，并非你的实际 Desktop 集成验收。项目采用 MIT 开源许可，非官方 DeepSeek / Codex 插件。
