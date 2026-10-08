# DSH Smart Compact v0.2.0

DeepSeek Harness（DSH）自动上下文压缩策略插件。针对长时编程会话，在下一次模型请求前按阈值触发 DSH 自带的 `compaction-basic` 引擎，压缩摘要随会话继续。**不会伪造一条“继续”消息，不自行删改任何聊天记录。**

## 功能

- 默认在上下文窗口 70% 处自动触发；超大窗口默认不晚于约 256K token 触发。
- 使用 DSH 官方 `ctx.compaction.compactIfNeeded(agent, 'context-overflow', signal)`；摘要的内容格式、工具调用配对、落盘事务均由 DSH 原生引擎处理。
- 保留手动 `/compact`；无须用户连续发送“继续”。
- 某次压缩返回 no-op 或失败时不会因同一上下文重复无限尝试；之后增长 2K token 再重试。失败后也总是放行正常模型请求。
- 所有使用此 DSH Profile 的、支持 `compaction-basic` 的 agent/session 均适用。
- 输入框右侧展示上下文用量圆环，支持打开面板修改自动压缩百分比。设置会保存到本地配置文件；只有回环地址和同源请求可以修改。
- 无远程遥测、无额外第三方运行时依赖；本地设置界面不向第三方上传数据。

## Windows 安装（原 DSH desktop Profile）

1. 启动 DSH Desktop 一次以初始化 `desktop` Profile，然后完整退出应用。
2. 在 PowerShell 运行下方 GitHub 安装命令（本地源码安装见下一段）：

```powershell
dsh plugin --profile desktop add github:HamizDev/dsh-smart-compact
```

3. 重新启动 DSH Desktop。安装成功不等于插件已经被当前运行的进程加载。
4. 可以使用 `dsh plugin --profile desktop list` 检查 bundle；观察 DSH 日志中的 `[dsh-smart-compact] enabled` 和 `compacted`。

如需从下载后的本地源码安装，先解压 ZIP 并进入插件根目录，再执行：

```powershell
dsh plugin --profile desktop add (Get-Location).Path
```

> **注意：** `desktop` Profile 只能由 DSH Desktop 自带的 `dsh` 命令管理。不要用 npm/npx 安装的 CLI 管理 `desktop` Profile。如果 `dsh` 命令不存在，请先在桌面客户端的 **Manage dsh Command** 中安装命令。
>
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

**直接编辑 JSON 配置文件后需要重启 DSH；使用圆环面板保存阈值后无需重启。**

例如模型窗口为 272K，默认在约 190K 开始尝试；若窗口为 1M，则在 256K 开始尝试。使用的是 DSH 的估算用量，未必等于服务商账单显示的输入 token。

## 卸载

```powershell
dsh plugin --profile desktop remove dsh-smart-compact
```

然后重启 DSH。原生 `compaction-basic` 不会被卸载；可选的 `smart-compact.json` 可以自行删除。

## 兼容性及局限

- 对照 DSH 0.1.0-rc.6 / 0.1.7-alpha 系列公开的 `agent/pre-step`、`agentPresets.serviceFor`、`tokenMeter`、`sessionProjections` 接口设计；实际 `desktop` Profile 的运行验收仍需在你的 DSH 实例进行。
- 输入区圆环基于 DSH `conversation.input.right` 插槽、`contextPressure` 投影构建。界面与本地 HTTP 设置端点仅经过模拟和静态检查，尚未在目标 DSH Desktop 版本实测。界面不可用时不影响 Host 端压缩。
- 不修改原生摘要提示词；关键上下文的保留质量由 DSH compaction-basic 决定，无法做到零信息损失。
- 如果已经安装其他自动压缩插件（如 `auto-compact` / `dsh-auto-compact`），请先停用其中一个，避免重复策略竞争。
- 仅用于合法的长会话上下文管理；不会绕过服务商模型的真实上下文窗口、调用额度和计费限制。

## 圆环与设置

输入区右侧的小圆环显示当前会话上下文占模型窗口的比例。点击可查看当前使用率、压缩阈值并通过滑杆保存。阈值保存于 `~/.dsh/smart-compact.json`（或 `$DSH_HOME/smart-compact.json`），即改即生效。

**安全约束：**设置接口仅接受 `localhost` / `127.0.0.1` / `::1` 的本地同源请求；如果 DSH Web 暴露在远程地址，该面板可能无法更改配置，自动压缩仍按已有设置工作。

## 本地测试

```powershell
npm test
```

不需要先下载其他依赖。测试使用模拟 DSH 运行时，**不是实际 DSH 集成测试**。
