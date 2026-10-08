# DSH Smart Compact v0.3.0

适用于 DeepSeek Harness（DSH）的 **Codex 风格自动上下文压缩插件**。只负责决定何时请求压缩，真正的摘要、历史记录维护、工具调用配对与恢复均由 DSH 原生 `compaction-basic` 完成。

## 核心规则

- **默认 90%**：按照当前模型的上下文窗口动态计算；没有固定 256K 上限。
- **95% 有效窗口安全边界**：如果 DSH 当前请求显式提供 `maxTokens`，会额外预留这部分输出空间。
- **按模型覆盖**：指定 `provider` 与 `model`，可单独设置更低的比例或固定 Token 阈值。
- **模型切换即时重算**：同一会话切换 128K/256K/1M 模型，阈值跟随模型窗口变化。
- 每个 agent step 开始前检查，调用原生引擎 `compactIfNeeded(agent, 'context-overflow', signal)`；压缩后自然继续任务，不伪造“继续”消息，也不写入假历史。
- 压缩失败或无可压缩区间时暂缓重试，避免同样上下文无限压缩；仍保留手动 `/compact`。
- **不重复 DSH 的原生上下文圆环**：输入区原生圆环继续显示使用率与 Token 构成，阈值在「设置 → 插件 → 可配置 → Smart Compact」调整。

默认计算规则：

```text
min(
  向下取整(模型上下文窗口 × 90%),
  向下取整(模型上下文窗口 × 95%) - 当前请求明确预留的输出 Tokens,
  可选的全局 Token 上限,
  可选的单模型 Token 上限
)
```

| 模型窗口 | 默认参考触发位置（无显式输出预留时） |
|---|---:|
| 32K | 28.8K |
| 128K | 115.2K |
| 256K | 230.4K |
| 1M | 900K |

**注意 DSH 内置压缩会更早执行：** 官方 `compaction-basic` 默认 `thresholdRatio: 0.8`，并额外预留输出 Token 与默认约 65,536 Token 的 headroom。因此本插件的 90% 是**本插件的触发线，不保证整体 DSH 一定等到 90% 才压缩**。为接近 Codex 的实际时机，可在所用 agent preset 的 `compaction-basic` 配置中协调设置 `thresholdRatio`、`headroomTokens`，但应保留溢出恢复功能。本插件不会擅自修改其他插件或原生配置。

## Windows 安装和升级

先彻底退出 DSH Desktop，再在 PowerShell 使用 DSH Desktop 自带命令：

```powershell
dsh plugin --profile desktop add github:HamizDev/dsh-smart-compact
```

重新打开 DSH。若已经装过旧版本，请在 DSH 插件列表核实是否更新为 v0.3.0；必要时按当前 DSH 版本的插件更新流程重装。不要使用另一份 npm/npx CLI 管理受保护的 `desktop` Profile。

## 配置

可通过「设置 → 插件 → 可配置 → Smart Compact」调整全局触发比例；高级设置位于 `~/.dsh/smart-compact.json`（若自定义 `DSH_HOME` 则在对应目录）：

```json
{
  "enabled": true,
  "triggerRatio": 0.9,
  "effectiveContextWindowRatio": 0.95,
  "maxTriggerTokens": null,
  "retryGrowthTokens": 2048,
  "modelPolicies": [
    {
      "provider": "example-provider",
      "model": "example-128k-model",
      "triggerRatio": 0.85
    },
    {
      "provider": "example-provider",
      "model": "example-1m-model",
      "autoCompactTokenLimit": 600000
    }
  ]
}
```

**示例中的模型名称是占位符，不能直接当作真实 DSH 模型 ID。** 配置文件编辑后需重启 DSH；设置页滑杆保存后立即生效。若此前已在 JSON 中设置 `triggerRatio: 0.7` 或 `maxTriggerTokens: 262144`，升级不会覆盖个人配置，你需要自行修改。

当模型容量未知、Token 计量失败、预留输出超过有效容量时，插件不会臆造阈值，而是保留 DSH 原生安全压缩行为。

## 测试与限制

```powershell
npm run check
```

CI 覆盖动态容量、模型覆盖、输出预留、切换模型、避免重复压缩、失败放行与本地设置接口。**尚未在你的 DSH Desktop 真实会话完成安装验收**，使用时应检查插件加载日志及内置压缩实际运行时机。

此项目非官方 Codex / DeepSeek 插件，采用 MIT License。
