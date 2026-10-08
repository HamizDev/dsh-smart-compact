# DSH Smart Compact

**Language:** English | [简体中文](./README.zh-CN.md)

A Codex-inspired automatic context compaction **controller** for DeepSeek Harness (DSH). The DSH `compaction-basic` backend remains installed and performs all summarization, transaction logging, session durability, and manual `/compact`. **Smart Compact alone decides automatic trigger timing** when the active Agent Preset's native compactor has `auto: false`.

## Quick start (v0.4.1)

1. Install/update with the **DSH Desktop** CLI (see below) and restart Desktop.
2. Open **Settings → Plugins → Configurable → Smart Compact**. The setup card expands automatically on first view and explains the next step. It shows the **last observed Agent** backend status, not a guarantee for every Agent Preset.
3. Press **Copy Creator setup prompt**, switch to **Creator mode** in DSH, and paste the prompt.
4. Creator must inspect your actual active Preset, preserve all plugins and settings, back up, present a diff and ask for confirmation **before applying anything**. If safe configuration is unavailable, stop.
5. Create a new conversation using the updated Preset. Return to Smart Compact settings and press **Refresh status**. Look for native \`auto:false\`; test \`/compact\` and recovery.

> **Why not a one-click mutation?** The official DSH Preset configuration viewer is read-only and the currently published supported flow is Creator/Bundle configuration. A preset cannot be safely rewritten just by toggling a host plugin row. The plugin deliberately offers a **one-click prompt copy**, not an unsafe one-click rewrite.

Installation does **not** automatically modify the active Preset or display a global toast. The onboarding card is visible under **Settings → Plugins → Configurable** whenever Smart Compact's client UI is loaded. If your DSH version lacks the client settings slot or optional local settings endpoint, follow the README steps instead; Host compaction remains independent.

## Exclusive mode (v0.4.1)

**Important: installing this bundle does NOT silently disable native compaction.** In DSH Desktop, `compaction-basic` lives inside the active Agent Preset (e.g. standard/cordis/ptc), not the host root. Changing or disabling the host's similarly named row is ineffective. DSH preset patches cannot safely target that nested child without restating the whole preset; we intentionally do not overwrite any user's Agent Presets.

To enable sole-controller behavior:

1. Install or upgrade Smart Compact.
2. Back up your current Agent Preset or profile patch.
3. Edit the **active Agent Preset** using DSH's preset editing workflow (or create a custom preset). In the existing `compaction` group, find the existing `compaction-basic` plugin. **Leave the plugin enabled**, but give it `config: { auto: false }`. Preserve any other preexisting compaction backend settings.
4. Restart DSH or create a **new session** using the updated preset; already-running Agent instances may retain their earlier preset generation.
5. Confirm logs show Smart Compact acting in exclusive mode and that `/compact` remains available. Confirm a longer test session can compress and resume.

The relevant inner preset YAML fragment is:

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
    # Preserve your existing pruner and other preset rows.
```

This fragment illustrates **where** the option belongs. Do NOT replace the entire preset with this partial example.

### Safety behavior

- If the active backend still reports `auto: true`, Smart Compact **does not run a second proactive policy**, and leaves DSH's native automatic compactor and overflow listener in place.
- If `auto` cannot be verified from the engine, Smart Compact **does not guess** or attempt to take over.
- When it reports `auto: false`, Smart Compact invokes **`compactIfNeeded(agent, 'pressure', signal)`** at the configured threshold, retaining DSH's native recent-history strategy (instead of forcing overflow mode).
- A **canonical** `CONTEXT_WINDOW_EXCEEDED` failure is handled separately: one bounded retry by default, only when DSH's durable surface generation actually advanced (including successful tool-result pruning before a failed summary). Cancellation, noncanonical failures, no mutation and exhausted retry budget preserve the original error.
- Never uninstall or disable the backend itself: `/compact` and summary persistence require it. If you later disable Smart Compact, **restore `compaction-basic config.auto: true` first**, or native automatic compaction/overflow recovery will remain unavailable.

## Trigger algorithm

Default global threshold: 90% of the currently routed model's context window, with a 95% effective-window ceiling and any explicit completion-token reservation. Optional per-provider/model lower limits and a global absolute ceiling are supported. No default fixed-token cap.

```text
triggerTokens = min(
  floor(modelContextWindow * triggerRatio),            # default 90%
  floor(modelContextWindow * effectiveWindowRatio) - explicitOutputReservation, # default 95%
  optionalGlobalMax, optionalExactModelMax
)
```

The real DSH backend may still reject a pressure request when its own safety/retention configuration is invalid for small models. It is not appropriate to disable overflow protection or fabricate context capacity.

## Install / update (Windows)

Quit DSH Desktop and use the `dsh` command bundled with Desktop:

```powershell
dsh plugin --profile desktop add github:HamizDev/dsh-smart-compact
```

Restart Desktop, check the actual installed version (0.4.1), then apply the **Agent Preset** change above. Existing sessions may need to be recreated to adopt the new preset.

### Configuration

Plugin-local configuration: `~/.dsh/smart-compact.json` or `$DSH_HOME/smart-compact.json`. The plugin's slider is in **Settings → Plugins → Configurable**; the native context meter remains untouched.

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

`exclusive: false` is an explicit compatibility mode that allows coexisting policy calls; this is **not recommended** because DSH may compact first. In exclusive mode, only verified `engine.config.auto === false` agents use Smart Compact's triggers and retry logic. If older profile overrides contain `triggerRatio: 0.7` or `maxTriggerTokens: 262144`, those are preserved across upgrades until manually changed.

`maxOverflowRetries: 0` disables the plugin's overflow recovery. An explicitly lower native `maxOverflowRetries` still bounds this value.

## Checks

```bash
npm run check
```

Node-based tests mock DSH's engine, setup-status endpoint, bilingual onboarding card and waterfall events. **Real Desktop activation remains unverified** until someone checks the installed preset and session. No injected duplicate context circle. No telemetry. MIT license. Not affiliated with Codex or DeepSeek.
