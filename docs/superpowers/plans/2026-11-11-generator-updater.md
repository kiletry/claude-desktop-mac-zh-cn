# Startup updater implementation plan

> Use executing-plans for implementation and requesting-code-review before integration. User approved startup checks and explicit install without automatic downloads.

Goal: each generator process checks latest stable release once at startup; user alone initiates downloading/installing.
Architecture: Swift release client and independent observable update state, DMG staging installer plus detached bundled shell swap helper. Existing public release checksum pipeline and universal Swift build remain in use.
Spec: docs/superpowers/specs/2026-11-11-generator-updater-design.md
Constraints: macOS13+, arm64/x64, no auto-download, preserve official app/clones/profiles, busy-operation exclusion, rollback, HTTPS repository URLs, strict version/identity/signature/checksum validation.
Review focus: hostile/malformed release metadata and URLs; repeated windows/startup; download failure leaves generation usable; stale target/source or symlink paths; app relocation/read-only permissions and helper failure after exit.

- [x] Release client tests RED then implementation: stable numeric versions, expected assets/URLs, HTTP errors, startup check requests metadata only. Files UpdateRelease.swift/UpdateReleaseTests.swift.
- [x] Coordinator tests RED then implementation: startup-once, available/latest/error, no implicit install, busy exclusion and explicit install delegation. Files GeneratorUpdateModel.swift/GeneratorUpdateModelTests.swift; wire SwiftUI menu/banner and operation locks.
- [x] Installer/checksum/identity/helper behavior tests RED then implementation: staged candidate validated before exit, timeout preserves old target, successful swap, failed validation rollback. Files GeneratorUpdateInstaller.swift, Resources/install-update.sh, tests/update-installer.test.mjs and Swift validation tests. Bundle helper through existing resource builder.
- [x] Full Node/Swift tests, universal build, real DMG validation and installer prepare against previous release without replacing installed tool; independent review.
- [x] Version0.1.26/docs/release notes, merge and tag, follow CI, download and verify public bundle and startup check behavior. Record evidence and limits.

## Verification and review (2026-11-11)

- Release/check/model tests established RED then GREEN in `/tmp/generator-updater-*-red.log` / `*-green.log`. Startup test invokes twice, observes one metadata check and zero install calls; manual check remains available.
- Full Node suite: 144 passed; Swift: 28 passed with `UPDATE_TEST_DMG_PATH` set to the published v0.1.25 DMG (no skipped integration). Real preparation mounted the public DMG read-only, verified checksum/identity/version/signature, staged a candidate, and preserved a separately signed temporary old app.
- Helper regressions reproduce two termination windows immediately after each rename, plus damaged candidate, concurrent/stale version, operation timeout, receipt failure/rollback, private readiness, and advisory locking/retry.
- Independent review found silent handoff, rollback signal windows, shared readiness, stale lock, and unsupported descriptor-mode lockf on macOS13/14. Fixed with bounded readiness acknowledgment, stable next-launch result, filesystem-based rollback, private ready path, and longstanding file-and-command `lockf -k` mode.
- Local release binaries built arm64 and x86_64, combined with lipo; both Mach-O slices report minimum macOS13.0. Signed local DMG bundle and clean embedded CLI checks passed.
- Actual SwiftUI window opened: official Claude5.1231.2 remains trusted, generation button enabled during updater network failure; scrolling and manual download/retry visible. Live unauthenticated API returned GitHub rate-limit403 on this network, so live successful availability/restart is not claimed. Deterministic metadata-only success tests and real published DMG staging passed. No real user login/Gateway inference or macOS13/14 machine run performed.
- Updater verifies SHA256SUMS from the same HTTPS GitHub release and the existing ad hoc bundle signature; this is not independently signed update metadata or Apple notarization. Successful helper installation retains the previous app beside the target for manual recovery.

Final pre-merge rerun: Node144/144, Swift28/28 including real DMG fixture, reviewer helper12/12. Review recheck reports no remaining important issue.

## Published artifact verification

- Released immutable tag `v0.1.26` at `0996d88e4a95e8e8dcbf6360a2d5c1ea2391cef7`; main fast-forwarded to the same implementation. GitHub run [42984947433](https://github.com/kiletry/claude-desktop-mac-zh-cn/actions/runs/42984947433) succeeded, including tests, universal build, clean bundle check and publication.
- Public Release: https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/tag/v0.1.26 . All four assets downloaded into main checkout `dist/release-v0.1.26`; all three SHA256SUMS entries passed.
- Public DMG SHA256: `ca3df52c1e2667afd595a34d5648a16e9d8ce4956f4ba747b48d95a535dddcca` (89,828,567 bytes).
- Read-only mounted downloaded DMG: bundle version0.1.26, manifest sourceCommit0996d88, strict deep codesign valid, arm64/x86_64 both minimum macOS13.0. Bundled helper matches committed file; extracted tgz Swift source/helper and embedded CLI src match release source. Clean embedded CLI test passed without host Node/project files.
- Authenticated GitHub latest metadata was captured, then fed unchanged to production release-check service with a transport that rejects every asset/download call: current0.1.25 offers v0.1.26, current0.1.26 offers none. Direct anonymous live request remains rate-limited on this network; recovery UI verified, successful real GUI update/restart not claimed. Unit model and real signed helper fixture tests cover explicit installation/restart delegation and swap/rollback.
- The old v0.1.25 app has no updater, so first upgrade to v0.1.26 is manual. From v0.1.26 onward startup checks metadata only and prompts; download begins only after the installation button.
