# Task 2 report: SwiftUI generator and Node bridge

## Delivered

- Added the standalone `installer-macos` SwiftPM executable package for macOS 13+.
- Added a SwiftUI `Claude 中文生成器` window with read-only official-app inspection,
  replacement confirmation, generation progress, limitations, redacted error details,
  and actions to open the clone, its data directory, and the log.
- Added the `GeneratorState` state machine and trusted official-app `Inspection` model.
- Added `NodeProcessBridge`, which launches the bundled Node executable, always requests
  JSON-line events, parses events incrementally, writes redacted logs under
  `~/Library/Logs/ClaudeChineseGenerator/`, removes credential-like environment entries,
  reports non-zero exits, and terminates the child on task cancellation.
- Added XCTest coverage for trusted/untrusted inspection, replacement confirmation,
  redacted failure output, JSON-event argument injection/parsing, log redaction, and
  cancellation.
- Added `.build/` to `.gitignore` so SwiftPM outputs from either macOS package stay
  outside version control.

## TDD evidence

The initial `swift test --package-path installer-macos` run failed as intended because
the new executable target was empty. The implementation then made the release target
compile successfully.

## Verification

| Command | Result |
| --- | --- |
| `swift build --configuration release --package-path installer-macos` | Passed |
| `swift test --package-path installer-macos` | Blocked by local developer tools: Command Line Tools lacks the `XCTest` module (`no such module 'XCTest'`) |
| `git diff --check` | Passed |

The checkout uses `/Library/Developer/CommandLineTools`, not a full Xcode installation;
the same missing-XCTest failure affects the pre-existing `companion-macos` XCTest suite.
Run the installer tests on a macOS host with Xcode/XCTest installed.

## Follow-up boundary

Task 3 supplies `Contents/Resources/runtime/node` and the packaged CLI. Until then, the
default app bridge can compile but does not have a bundled runtime to launch.
