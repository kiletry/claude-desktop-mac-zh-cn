# Task 3 report — embedded generator runtime

## Delivered

- Added deterministic `scripts/build-generator-app.mjs` assembly of the Swift app,
  the allow-listed CLI package, and explicitly supplied `node-arm64`/`node-x64`
  binaries.
- Added resource manifest with package version, source commit, and supported
  architectures, plus first-launch instructions.
- Updated the bridge to select the matching embedded runtime, reject unsupported
  architectures or missing embedded binaries with a clear launch error, preserve
  `HOME`, and provide the isolated Chinese clone data path.
- Added package tests proving required resources and exclusion of apps, Swift
  builds, Keychain files, and API-key fixture material.
- Hardened output cleanup to permit only `Claude 中文生成器.app` destinations,
  reject protected app/source/root paths before removal, require the README in
  the selected source root, and report a missing embedded CLI explicitly.

## Verification

- `swift build --configuration release --package-path installer-macos` passed.
- `node --test test/generator-package.test.mjs` passed: 4/4.
- `npm test` passed: 52/52.
- `git diff --check` passed.

## Note

The existing untracked `package-lock.json` was deliberately neither edited nor
staged. It is intentionally copied into a packaged CLI because the approved
runtime package interface requires it.
