# DSH Smart Compact

[简体中文说明](./README.zh-CN.md)

A DeepSeek Harness plugin that automatically compacts conversation context using the **native DSH compaction engine**. It offers a session context-usage ring next to the conversation input and a local threshold slider. It does not forge continuation messages or rewrite conversation history.

## Features

- Trigger before a model step at **70% of model context** (default), capped at **262,144 tokens** on very large models.
- Delegate summarization and persistence to DSH `compaction-basic`.
- No additional runtime npm dependencies or outbound telemetry.
- Client-side context usage ring, with a threshold slider persisted to the local DSH home directory.
- Fall back gracefully if the UI, projection or compaction engine is unavailable.

## Install on DSH Desktop

Launch DSH Desktop once to initialize its profile, then fully quit it. Install using the **Desktop-provided** `dsh` command (not the npm/npx command, which cannot manage the reserved desktop profile):

```powershell
dsh plugin --profile desktop add github:HamizDev/dsh-smart-compact
```

Restart DSH Desktop. If `dsh` is unavailable, use **Manage dsh Command** in DSH Desktop first. A local checkout can also be installed with `dsh plugin --profile desktop add (Get-Location).Path`.

On non-Desktop DSH, substitute `web` for `desktop`.

## Configure

Optional file: `~/.dsh/smart-compact.json` (or `$DSH_HOME/smart-compact.json`):

```json
{
  "enabled": true,
  "triggerRatio": 0.7,
  "maxTriggerTokens": 262144,
  "retryGrowthTokens": 2048
}
```

The slider changes `triggerRatio` without a restart. Changes to this file made by hand require a restart. The settings endpoint only allows loopback, same-origin requests.

## Verify

```bash
npm test
npm run check
```

**Compatibility note:** the host behavior has mock coverage. The Web UI and persistence endpoint have static / mock tests, but target-version DSH Desktop integration has not yet been verified. This is a third-party plugin, not an official DeepSeek project.

## License

MIT.
