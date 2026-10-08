# DSH Smart Compact v0.4.0

面向 DeepSeek Harness（DSH）的 **Codex 风格独占自动压缩控制器**。插件决定自动压缩时机；官方 `compaction-basic` 负责真正的摘要、会话持久化、工具调用配对和手动 `/compact`。

## 如何真正让 Smart Compact 单独控制压缩？

**不能直接卸载或停用原生 `compaction-basic`！** DSH Desktop 的 `compaction-basic` 位于每个 Agent Preset 的 `compaction` 分组中，而非单独的 Host 行。简单修改 Host 配置不起作用，且修改一个 Preset 的整套插件清单可能覆盖你当前的其他定制功能。插件不会擅自重写 Preset。

请按顺序操作：

1. 安装或更新 Smart Compact 到 **v0.4.0**。
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

**只调整原生引擎的自动监听器，不关闭引擎**。关闭原生 `auto` 会同时停止原生的提前压缩和溢出重试，所以 v0.4.0 还独立接管了标准上下文溢出后的受限重试。

### 运行逻辑

- **原生仍 `auto: true`**：Smart Compact 检测到后自动让路，不会与原生 80% 策略重复竞争。
- **确认原生 `auto: false`**：Smart Compact 的 Codex 风格阈值接管主动检测，调用原生 `compactIfNeeded(agent, 'pressure', signal)`，保留近期历史的原生策略。
- **无法确认引擎状态**：安全旁路并记录警告，不盲目停用原生机制。
- **真溢出**（错误码 `CONTEXT_WINDOW_EXCEEDED`）：最多重试一次（可配置），且仅当会话表层的持久修订号已推进才执行重试。无修改、取消、非溢出错误一律保留原错误。
- **手动压缩**：DSH 自带的 `/compact` 不变。
- **界面**：直接使用 DSH 原生 Token 圆环；阈值在「设置 → 插件 → 可配置 → Smart Compact」调整。

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

重启并确认安装版本为 0.4.0。修改 Preset 后，建议新建一个使用该 Preset 的会话验收。不要用独立 npm/npx 的 DSH CLI 修改受保护的 Desktop Profile。

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

以上测试使用 DSH 的模拟回调与压缩引擎，并非你的实际 Desktop 集成验收。项目采用 MIT 开源许可，非官方 DeepSeek / Codex 插件。
