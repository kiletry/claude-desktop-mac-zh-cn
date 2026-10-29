# Gateway Profile Compatibility Implementation Plan

**Goal:** Ship v0.1.21 with a launcher that recovers Gateway configuration previously written to the Chinese clone's main profile when Claude 4.29 reads its sibling `-3p` profile.

**Architecture:** Use the existing native shell launcher and macOS plist tools. Copy an eligible clone-owned configuration only when the destination has no configuration library, preserve existing preferences, back up changed desktop configuration, and stage copies with private permissions. Existing third-party configuration and explicit first-party mode take precedence. Do not import official profiles, OAuth data or Keychain items. Keep old launcher arguments and old Claude compatibility.

**Approach:** A startup compatibility migration handles third-party tools that write the old path after generation; a generator-only migration would miss those later changes. Native macOS tools avoid adding a Node dependency to the launched Claude clone.

- [x] Write failing behavioral launcher tests for legacy Gateway migration, existing destination preservation, explicit first-party mode, incomplete source and private files. Execute generated launcher with a fake native binary and temporary profiles.
- [x] Implement the shell compatibility step, preserve the single `--user-data-dir=...` argument, and seed Chinese locale in both profiles. Final suite: 126 Node and 13 Swift passed. Embedded generator clean check and real Claude 4.29 clone generation/signature verified; official source hashes unchanged.
- [ ] Update README, installer guide, bundled first-launch notice and release notes. Build v0.1.21 through GitHub Actions, verify downloaded DMG and embedded launcher fix, and give the user the new installer.

Review focus: partial target profiles; malformed JSON; source symlinks; repeated/concurrent launches; user preference preservation. Local secrets must remain outside Git and release artifacts.

Final review: independent reviewer `review_gateway_release` completed; no critical findings.
Final: fixed partial publication — failed desktop publication regression RED→GREEN; publish library last so retries remain possible.
Final: fixed empty desktop JSON — empty/missing preferences regression RED→GREEN; edit through unambiguous XML before converting to JSON.
Final: fixed stale migration locks — exited-process lock regression RED→GREEN; native lockf file-and-command invocation releases on process exit. Concurrency regression passes.
Final verification: `npm test` → 126/126; full-Xcode `swift test --package-path installer-macos --scratch-path /tmp/claude-4.29-release-swift` → 13/13; `git diff --check` → clean.
Review limits: synthetic credentials cover migration; real Gateway homepage and ConfigHealth were inspected separately, with no inference request. Cowork signature restrictions and older macOS runtime behavior are outside this fix's validation.

CI follow-up: diagnostic traces established that macOS 14 has no lockf executable. Use lockf when present, otherwise system shlock with a dedicated shell owner (not Claude's long-running PID). The missing-lockf concurrent/stale-lock regression passed after first failing; macOS 14 CI is required before the next release tag. v0.1.19 and v0.1.20 never published assets; continue as v0.1.21 without rewriting tags.
