# Changelog

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
