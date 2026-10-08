# DSH Smart Compact

[简体中文说明](./README.zh-CN.md)

A **Codex-inspired** automatic context compaction trigger for DeepSeek Harness (DSH). It uses DSH's native `compaction-basic` engine, keeps DSH's built-in context meter and statistics popup, and provides threshold controls under **Settings → Plugins → Configurable**.

## Codex-style policy (v0.3.0)

- **90% default** of the active model's reported context window. No default absolute 256K cap.
- **95% effective-window safety ceiling**, minus the latest routed request's **explicit** reserved output `maxTokens` when present.
- Optional exact `provider` / `model` policy with a *lower* threshold ratio or `autoCompactTokenLimit`.
- The plugin checks between agent steps and delegates actual compaction to DSH (no forged continuation messages, no direct session-history edits). It leaves `/compact` intact.
- Skips unavailable model capacity rather than inventing a token count. Does not continuously retry the same unchanged or failed attempt.
- No telemetry or extra runtime npm dependencies.

Calculation: `min(floor(contextWindow * ratio), floor(contextWindow * 0.95) - routedMaxTokens, optionalGlobalLimit, optionalModelLimit)`. Default `ratio = 0.90`. If the request doesn't expose a reliable output cap, this plugin reserves **0**, leaving the DSH engine's own safety policy in control.

| Window | Trigger without explicit reserved output |
|---|---:|
| 32K | 28.8K |
| 128K | 115.2K |
| 256K | 230.4K |
| 1M | 900K |

**Important native DSH interaction:** DSH's standard `compaction-basic` independently auto-compacts at about **80%** by default, or earlier to preserve reserved completion tokens and ~65K headroom. This plugin **does not disable, monkey-patch or supersede** that safety behavior. Therefore 90% is this plugin's own threshold **not a promise** that actual compaction will wait until 90%. To align native compaction closer to Codex, adjust `compaction-basic`'s `thresholdRatio` and `headroomTokens` in your DSH agent preset, considering real output reservations and small-window models. Don't switch off overflow recovery.

## Install / upgrade (DSH Desktop)

Close DSH Desktop, then with its bundled CLI:

```powershell
dsh plugin --profile desktop add github:HamizDev/dsh-smart-compact
```

Restart DSH Desktop and inspect the Plugins list/logs. If an older release is already installed, confirm the installed plugin source/version actually updates to 0.3.0 using your DSH version's plugin update/reinstall workflow. Never use an independent npm/npx CLI to manage the reserved `desktop` Profile.

## Configuration

Edit `~/.dsh/smart-compact.json` (or `$DSH_HOME/smart-compact.json`), or set the global ratio from **Settings → Plugins → Configurable → Smart Compact**:

```json
{
  "enabled": true,
  "triggerRatio": 0.9,
  "effectiveContextWindowRatio": 0.95,
  "maxTriggerTokens": null,
  "retryGrowthTokens": 2048,
  "modelPolicies": [
    { "provider": "example-provider", "model": "example-128k-model", "triggerRatio": 0.85 },
    { "provider": "example-provider", "model": "example-1m-model", "autoCompactTokenLimit": 600000 }
  ]
}
```

The example model names above are placeholders, **not real model IDs**. Remove the entries or use the exact names found in your DSH routed request. Per-model overrides can only lower the global threshold (never exceed Codex's 90% ceiling). Set `maxTriggerTokens` to an integer for a global absolute ceiling; default is `null`.

Previously saved `triggerRatio: 0.7` or `maxTriggerTokens: 262144` remains effective across upgrades until you change it. The settings slider changes `triggerRatio` immediately; editing the JSON file requires restarting DSH.

## Compatibility and tests

```bash
npm run check
```

Unit/mocked tests cover varying context windows, model changes, reserved output, independent native delegation, failure continuation and settings access. **Actual DSH Desktop behavior remains to be verified** on the user's installed version; the native backend may compact earlier. This project is community maintained, not an official Codex or DeepSeek product.

License: MIT.
