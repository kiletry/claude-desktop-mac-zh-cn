# SDD ledger — plan: docs/superpowers/plans/2026-08-20-graphical-installer.md

Plan accepted by user on 2026-08-20. Existing untracked `package-lock.json` is user-owned and must not be altered or staged.

Pre-flight review: no contradictions found between the approved spec, plan, and review rubric. Tasks will execute sequentially.

Task 1: complete — commit 7648ed9. Initial review found P1 issues in final verification/error ordering and progress-stage accuracy; implementer fixed both and added regression tests. Focused tests 19/19 and full suite 48/48 pass.

Task 2: implementation complete — commit c44d192. Review fixes applied locally: official bundle ID aligned with `com.anthropic.claudefordesktop`, cancellation now owns and cancels the ViewModel generation task, failed states require a fresh official-app check, and redaction covers common secret names. Swift release build passes; XCTest remains unavailable on this machine because only CommandLineTools are installed.

Task 3: complete — commits b04bbe5 and 00c0fd5. Added deterministic self-contained App assembly with embedded arm64/x64 Node runtimes, CLI resources, manifest, and first-launch notice. Follow-up review fix rejects unsafe output destinations before deletion and reports missing embedded CLI clearly. Packaging tests 4/4, full Node suite 52/52, Swift release build, and diff check pass.

Task 4: implementation complete — commit bfaa80a; safety follow-up commit 3f14c06. Added DMG builder, bundle verifier, npm commands, and developer packaging docs. Follow-up rejects symlinked or /Applications signing inputs, rejects embedded Claude apps before signing, and verifies symlink entries. Distribution tests 7/7, full Node suite 57/57, real local DMG creation and bundle verification pass after dependency-link fix 70cc321.

Task 5: complete — commit 8663b1d. Added pinned Node runtime downloads and SHA-256 checks, universal Swift build, DMG/CLI artifact publication, release notes, GUI guide, and release-manifest tests. Release-manifest 2/2 and full Node suite 62/62 pass; full Swift XCTest/universal build is reserved for GitHub macOS with Xcode.

Task 6: complete — commit 7d02be3. Added clean-machine verification, disposable HOME/official-fixture integrity checks, `Quality gate passed` evidence, and final release acceptance documentation. E2E clean-check passes with exit code 0; package-lock.json remains user-owned and untracked.

Final review fixes: commits 32a8814 and 40f43ef. Replaced runtime `npx @electron/asar` calls with the embedded `@electron/asar` library, synchronized App version with package version, added Bundle ID and Cockpit/CC Switch guidance to the GUI, and made the release workflow run clean-check plus publish SHA256SUMS. E2E fixture now includes packaged dependencies. Node suite remains 63/63; Swift release build passes.

Additional clean-check fix: commit 07ac96e. The clean acceptance now runs from its disposable directory with absolute embedded paths, so it does not depend on the caller's working directory. Real local packaged App verification and `Quality gate passed` both pass.
