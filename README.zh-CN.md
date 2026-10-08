# DSH Smart Compact v0.1.0

DeepSeek Harness（DSH）自动上下文压缩策略插件。针对长时编程会话，在下一次模型请求前按阈值触发 DSH 自带的 `compaction-basic` 引擎，压缩摘要随会话继续。**不会伪造一条“继续”消息，不自行删改任何聊天记录。**

## 功能

- 默认在上下文窗口 70% 处自动触发；超大窗口默认不晚于约 256K token 触发。
- 使用 DSH 官方 `ctx.compaction.compactIfNeeded(agent, 'context-overflow', signal)`；摘要的内容格式、工具调用配对、落盘事务均由 DSH 原生引擎处理。
- 保留手动 `/compact`；无须用户连续发送“继续”。
- 某次压缩返回 no-op 或失败时不会因同一上下文重复无限尝试；之后增长 2K token 再重试。失败后也总是放行正常模型请求。
- 所有使用此 DSH Profile 的、支持 `compaction-basic` 的 agent/session 均适用。
- 无 HTTP 接口、无远程遥测、无额外第三方依赖；只读取可选本地配置文件。

## Windows 安装（原 DSH desktop Profile）

1. 解压 ZIP 至一个**不再移动**的位置，例如 `D:\Tools\dsh-smart-compact`。
2. 在该目录打开 PowerShell，执行（`npx.cmd` 用来规避 PowerShell 的 `npx.ps1` 执行策略限制）：

```powershell
npx.cmd -y --package @deepseek-ai/dsh dsh plugin --profile desktop add (Get-Location).Path
```

3. 关闭并重新启动使用 `desktop` Profile 的 DSH。安装成功不等于插件已经被当前运行的进程加载。
4. 可以使用 `npx.cmd -y --package @deepseek-ai/dsh dsh --profile desktop --dump-config` 检查 bundle；观察 DSH 日志中的 `[dsh-smart-compact] enabled` 和 `compacted`。

使用命令行全局安装的 `dsh` 时，也可直接执行：

```powershell
dsh plugin --profile desktop add (Get-Location).Path
```

> DSH 需要能够加载 `@deepseek-ai/dsh-compaction-basic`。标准/代码类 preset 常自带；`minimal` 可能没有。若模型/Provider 没有暴露上下文窗口大小，本插件不强制猜值，交由 DSH 内置压缩策略处理。

## 配置

将仓库中的 `smart-compact.example.json` **复制**到 `$env:USERPROFILE\.dsh\smart-compact.json`（使用非默认 `DSH_HOME` 时放到 `$env:DSH_HOME\smart-compact.json`）。默认无需创建文件。

```json
{
  "enabled": true,
  "triggerRatio": 0.7,
  "maxTriggerTokens": 262144,
  "retryGrowthTokens": 2048
}
```

- `triggerRatio`：上下文窗口的比例，范围 0.20–0.95。
- `maxTriggerTokens`：可设为 `null` 关闭 256K 上限。实际触发 token 数量是两项中的较小值。
- `retryGrowthTokens`：上次失败/无变化后，至少增长多少 token 才再试。
- `enabled: false`：停用本插件，不影响 DSH 原生压缩。

**修改配置后重启 DSH。**

例如模型窗口为 272K，默认在约 190K 开始尝试；若窗口为 1M，则在 256K 开始尝试。使用的是 DSH 的估算用量，未必等于服务商账单显示的输入 token。

## 卸载

```powershell
npx.cmd -y --package @deepseek-ai/dsh dsh plugin --profile desktop remove dsh-smart-compact
```

然后重启 DSH。原生 `compaction-basic` 不会被卸载；可选的 `smart-compact.json` 可以自行删除。

## 兼容性及局限

- 对照 DSH 0.1.0-rc.6 / 0.1.7-alpha 系列公开的 `agent/pre-step`、`agentPresets.serviceFor`、`tokenMeter`、`sessionProjections` 接口设计；实际 `desktop` Profile 的运行验收仍需在你的 DSH 实例进行。
- 本包未附加 UI 滑杆，以避免 DSH Web/Settings API 版本差异。不修改原生摘要提示词；关键上下文的保留质量由 DSH compaction-basic 决定，无法做到零信息损失。
- 如果已经安装其他自动压缩插件（如 `auto-compact` / `dsh-auto-compact`），请先停用其中一个，避免重复策略竞争。
- 仅用于合法的长会话上下文管理；不会绕过服务商模型的真实上下文窗口、调用额度和计费限制。

## 本地测试

```powershell
npm test
```

不需要先下载其他依赖。测试使用模拟 DSH 运行时，**不是实际 DSH 集成测试**。
