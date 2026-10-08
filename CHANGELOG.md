# Changelog

## v0.4.1

- Add bilingual (English / 简体中文) first-run onboarding in DSH Plugin Settings.
- Default-expand Smart Compact settings with clear Creator-based setup instructions and a one-click **copy prompt** action; no silent Preset edits or deceptive one-click claim.
- Show the **last observed Agent's** native compaction engine mode (\`auto:true\`, \`auto:false\`, unknown, missing), and provide a refresh control. No profile/session identifiers are shared.
- Keep the DSH native context meter and all existing compaction/overflow behavior unchanged.
- Refresh README quick starts in both languages and document manual fallback if the Desktop settings slot is unavailable.


## v0.4.0

- Add exclusive policy mode: Smart Compact alone requests automatic pressure compaction when active preset `compaction-basic` reports `auto: false`.
- Prevent duplicate pressure calls while native automatic compaction is enabled (safe fallback).
- Use the native `pressure` compaction trigger proactively, retaining native recent-history policy, rather than misusing overflow mode.
- Restore bounded canonical context-overflow retry when native auto listeners are disabled. Require durable surface generation advancement; respect cancellation, zero/no-op, native retry cap and error propagation.
- Document required Agent Preset change and safe rollback; preserve `/compact` and DSH native meter.

## v0.3.0

- Use a Codex-inspired trigger: default 90% of the current model context window, with a 95% effective-window safety ceiling.
- Account for the routed request's explicit output token reservation when computing the safe threshold.
- Add optional exact provider/model overrides (lower percentage or absolute token limit) and remove default absolute caps.
- Re-evaluate when model or capacity changes, even if the token count is unchanged.
- Keep DSH's native ring, summarizer, overflow protection and existing automatic compaction. Native compaction can still run sooner (DSH default threshold 80% and extra headroom).
- Add 32K/128K/256K/1M window tests and model-specific safety tests.

## v0.2.1

- Remove the duplicate conversation input context ring; keep the native DSH context meter and its richer statistics popup.
- Move the adjustable automatic compaction threshold to DSH Settings → Plugins → Configurable.
- Remove the 256K default cap so the configured ratio works correctly for 1M-context models (70% now means approximately 700K).
- Keep an explicit optional maxTriggerTokens cap for users who want it.

## v0.2.0

- Add real-time context usage ring in the DSH conversation input.
- Allow on-device editing and persistence of automatic compaction threshold.
- Add basic client and settings endpoint tests.

## v0.1.0

- First release: native DSH compaction trigger and configurable threshold.
- Preserve recent conversation continuity and safely continue on failures.

## v0.4.0

- Add exclusive policy mode: Smart Compact alone requests automatic pressure compaction when active preset `compaction-basic` reports `auto: false`.
- Prevent duplicate pressure calls while native automatic compaction is enabled (safe fallback).
- Use the native `pressure` compaction trigger proactively, retaining native recent-history policy, rather than misusing overflow mode.
- Restore bounded canonical context-overflow retry when native auto listeners are disabled. Require durable surface generation advancement; respect cancellation, zero/no-op, native retry cap and error propagation.
- Document required Agent Preset change and safe rollback; preserve `/compact` and DSH native meter.

## v0.3.0

- Use a Codex-inspired trigger: default 90% of the current model context window, with a 95% effective-window safety ceiling.
- Account for the routed request's explicit output token reservation when computing the safe threshold.
- Add optional exact provider/model overrides (lower percentage or absolute token limit) and remove default absolute caps.
- Re-evaluate when model or capacity changes, even if the token count is unchanged.
- Keep DSH's native ring, summarizer, overflow protection and existing automatic compaction. Native compaction can still run sooner (DSH default threshold 80% and extra headroom).
- Add 32K/128K/256K/1M window tests and model-specific safety tests.

## v0.2.1

- Remove the duplicate conversation input context ring; keep the native DSH context meter and its richer statistics popup.
- Move the adjustable automatic compaction threshold to DSH Settings → Plugins → Configurable.
- Remove the 256K default cap so the configured ratio works correctly for 1M-context models (70% now means approximately 700K).
- Keep an explicit optional maxTriggerTokens cap for users who want it.

## v0.2.0

- Add real-time context usage ring in the DSH conversation input.
- Allow on-device editing and persistence of automatic compaction threshold.
- Add basic client and settings endpoint tests.

## v0.1.0

- First release: native DSH compaction trigger and configurable threshold.
- Preserve recent conversation continuity and safely continue on failures.
