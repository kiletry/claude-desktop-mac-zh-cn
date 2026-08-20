# Claude Desktop macOS 图形化生成器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 CLI 的同时，构建无需用户安装 Node.js 的 SwiftUI `Claude 中文生成器.app`，并发布可拖拽安装的 macOS `.dmg`。

**Architecture:** SwiftUI 图形层只负责检查、确认、进度、日志和打开操作；Node 子进程层复用现有 `src/cli.mjs` 的 `status` 与 `generate` 行为；构建层把 CLI、生产依赖和 arm64/x86_64 Node 运行时嵌入生成器 App，再用 `hdiutil` 生成 DMG。官方 Claude 只读验证，生成逻辑只写独立中文副本。

**Tech Stack:** Swift 5.9、SwiftUI、Swift Package Manager、Node.js 18+ CLI、`@electron/asar`、macOS `codesign`/`hdiutil`、Node `node:test`。

## Global Constraints

- GUI 使用 SwiftUI 原生 macOS App，不使用 Electron 作为安装器运行时。
- Release GUI 必须内置 Node 运行时；用户不需要预装 Node.js。
- 官方 `/Applications/Claude.app` 只读检查，不修改、不重签名、不移除隔离属性、不写入其目录。
- 中文副本固定为 `/Applications/Claude 中文.app`，数据目录固定为 `~/Library/Application Support/Claude Desktop zh-CN`。
- 覆盖已有中文副本必须经过 GUI 明确确认；生成使用临时目录和回滚路径。
- GUI 与 CLI 必须调用同一套 `src/` 生成逻辑，禁止维护第二套翻译或签名实现。
- 不复制 Keychain、OAuth token、Cookie、会话或 API Key；日志必须遮罩敏感字段。
- GitHub Release 提供 `.dmg` 和现有 `.tgz`，不发布 Anthropic Claude 二进制文件。
- 现有 `npm test` 40 项测试必须继续通过；新增测试必须覆盖失败、取消和已有副本覆盖确认。

---

### Task 1: 建立 CLI 子进程协议与可测试事件输出

**Files:**
- Modify: `src/cli.mjs`
- Create: `src/generator-events.mjs`
- Test: `test/cli.test.mjs`
- Test: `test/generator-events.test.mjs`

**Interfaces:**
- Produces `runGeneratorCommand(argv, { cwd, env, spawn }) -> Promise<{ exitCode, stdout, stderr }>` for the Swift bridge contract.
- Produces newline-delimited JSON events with `event`, `stage`, `message`, `value` fields; secrets are never included.
- Preserves existing `runCli(argv, dependencies)` and its JSON output for command-line users.

- [ ] **Step 1: Write failing tests for machine-readable status and generation events**

Add tests that execute the CLI with injected dependencies and assert:

```js
assert.deepEqual(events.map((event) => event.event), ['inspection_started', 'inspection_succeeded']);
assert.equal(events.some((event) => JSON.stringify(event).includes('sk-')), false);
```

Add a generation test asserting stage order `copy`, `translation`, `runtime_patch`, `sign`, `verify`, `completed` and a nonzero error event when the official app fails trust checks.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node --test test/cli.test.mjs test/generator-events.test.mjs`

Expected: the new event/protocol assertions fail because no event serializer or bridge command exists.

- [ ] **Step 3: Implement the event serializer and bridge-safe CLI mode**

Add `src/generator-events.mjs` with strict event constructors and a `redactSensitiveText(text)` function that masks values following `apiKey`, `token`, `authorization`, `Bearer`, and `sk-` patterns. Extend `src/cli.mjs` with a `--json-events` option that emits one JSON object per line while retaining the final result object and exit code. Do not change `generate --replace` semantics.

- [ ] **Step 4: Run the focused tests and the full CLI suite**

Run: `node --test test/cli.test.mjs test/generator-events.test.mjs && npm test`

Expected: all tests pass, including the existing 40-test suite plus the new protocol tests.

- [ ] **Step 5: Commit the protocol slice**

```bash
git add src/cli.mjs src/generator-events.mjs test/cli.test.mjs test/generator-events.test.mjs
git commit -m "feat: add GUI-safe generator event protocol"
```

### Task 2: Add SwiftUI state machine and Node process bridge

**Files:**
- Modify: `companion-macos/Package.swift`
- Create: `installer-macos/Package.swift`
- Create: `installer-macos/Sources/ClaudeChineseGenerator/GeneratorApp.swift`
- Create: `installer-macos/Sources/ClaudeChineseGenerator/GeneratorState.swift`
- Create: `installer-macos/Sources/ClaudeChineseGenerator/GeneratorViewModel.swift`
- Create: `installer-macos/Sources/ClaudeChineseGenerator/NodeProcessBridge.swift`
- Create: `installer-macos/Sources/ClaudeChineseGenerator/LogRedactor.swift`
- Create: `installer-macos/Tests/GeneratorStateTests.swift`
- Create: `installer-macos/Tests/NodeProcessBridgeTests.swift`

**Interfaces:**
- `GeneratorState`: `.checking`, `.ready(Inspection)`, `.confirmingReplacement`, `.generating(Progress)`, `.completed(ResultSummary)`, `.failed(GeneratorError)`.
- `NodeProcessBridge.run(arguments: [String], environment: [String:String], onEvent: (GeneratorEvent) -> Void) async throws -> ProcessResult`.
- `GeneratorViewModel.check()`, `confirmAndGenerate()`, `cancelGeneration()`, `openClone()`, `openDataDirectory()`, `revealLog()`.

- [ ] **Step 1: Write failing state-machine and bridge tests**

Test that `check()` transitions to `.ready` only for a trusted official app, existing output transitions to `.confirmingReplacement`, cancellation terminates the child process, and a nonzero CLI exit produces `.failed` with redacted output.

- [ ] **Step 2: Run Swift tests to confirm RED**

Run: `swift test --package-path installer-macos`

Expected: the package and symbols are missing, so the new tests fail to compile.

- [ ] **Step 3: Implement the bridge and state machine**

Use `Foundation.Process` with pipes, pass `--json-events`, parse each line into `GeneratorEvent`, keep the full redacted log in a temporary file under `~/Library/Logs/ClaudeChineseGenerator/`, and terminate the process on cancellation. Never pass credentials through the bridge. Implement the SwiftUI view with a read-only inspection card, a primary “生成/更新中文副本” button, a replacement confirmation alert, progress stages, limitations panel, and success actions.

- [ ] **Step 4: Run Swift tests and build the app**

Run: `swift test --package-path installer-macos && swift build --configuration release --package-path installer-macos`

Expected: state, cancellation, redaction, and bridge tests pass; release executable is produced.

- [ ] **Step 5: Commit the GUI slice**

```bash
git add installer-macos companion-macos/Package.swift
git commit -m "feat: add SwiftUI Claude generator app"
```

### Task 3: Bundle the CLI and Node runtimes inside the generator App

**Files:**
- Create: `scripts/build-generator-app.mjs`
- Create: `installer-macos/Resources/README-first-launch.txt`
- Modify: `installer-macos/Sources/ClaudeChineseGenerator/NodeProcessBridge.swift`
- Modify: `.npmignore`
- Test: `test/generator-package.test.mjs`

**Interfaces:**
- `scripts/build-generator-app.mjs --runtime-dir <dir> --output <app>` creates a self-contained `.app`.
- App resources contain `runtime/node-arm64`, `runtime/node-x64`, `runtime/package/`, and the CLI entrypoint.
- The bridge chooses the runtime by `ProcessInfo.processInfo.machineArchitecture` and falls back with a clear unsupported-architecture error.

- [ ] **Step 1: Write failing packaging tests**

Test the resource manifest for both architectures, rejection of missing runtime binaries, exclusion of `Claude.app`, `Claude 中文.app`, `.build`, Keychain files, and API-key-like fixture content.

- [ ] **Step 2: Run packaging tests to confirm RED**

Run: `node --test test/generator-package.test.mjs`

Expected: the builder and manifest do not exist.

- [ ] **Step 3: Implement deterministic app assembly**

Copy only `bin/`, `src/`, `package.json`, `package-lock.json`, production `node_modules`, and the two explicitly supplied Node binaries into a staging App. Generate `Info.plist` with bundle ID `com.kiletry.claude-desktop-mac-zh-cn-generator`, display name `Claude 中文生成器`, and a usage description for writing the independent clone. Make the Swift executable and Node binaries executable. Write a manifest containing generator version, supported architectures, and source commit.

- [ ] **Step 4: Implement runtime lookup and run packaging tests**

Resolve the embedded CLI path relative to `Bundle.main.resourceURL`, set `HOME` unchanged, and set only `CLAUDE_DESKTOP_ZH_CN_USER_DATA_DIR` when the generator invokes the CLI. Run:

```bash
node --test test/generator-package.test.mjs && npm test
```

Expected: packaging tests and all existing tests pass.

- [ ] **Step 5: Commit embedded-runtime support**

```bash
git add scripts/build-generator-app.mjs installer-macos/Resources installer-macos/Sources/ClaudeChineseGenerator/NodeProcessBridge.swift .npmignore test/generator-package.test.mjs
git commit -m "feat: bundle Node runtime with graphical generator"
```

### Task 4: Build and verify the DMG distribution

**Files:**
- Create: `scripts/build-dmg.sh`
- Create: `scripts/verify-generator-bundle.sh`
- Modify: `package.json`
- Modify: `README.md`
- Test: `test/distribution.test.mjs`

**Interfaces:**
- `npm run build:generator -- --runtime-dir <dir> --output-dir dist/Claude 中文生成器.app` builds the app.
- `npm run build:dmg -- --app dist/Claude 中文生成器.app --output dist/Claude 中文生成器-macOS.dmg` creates the DMG.
- `scripts/verify-generator-bundle.sh <app>` checks bundle ID, embedded runtimes, absence of Claude binaries, ad-hoc signature validity, and CLI help output.

- [ ] **Step 1: Write failing distribution tests**

Assert that the DMG build command requires an existing generator App, creates a writable staging volume with an Applications alias, and that verification rejects missing runtimes or an embedded `Claude.app`.

- [ ] **Step 2: Run distribution tests to confirm RED**

Run: `node --test test/distribution.test.mjs`

Expected: build scripts and npm entries are absent.

- [ ] **Step 3: Implement DMG assembly and verification**

Use `hdiutil create` with a temporary staging directory, copy the generator App, create an `/Applications` alias, set a stable volume name `Claude 中文生成器`, detach the image, and clean staging files on failure. Verify the DMG contains only the generator App and alias; never include `/Applications/Claude.app` or a generated clone.

- [ ] **Step 4: Run app, DMG, and full verification**

Run:

```bash
npm run build:generator -- --runtime-dir "$NODE_RUNTIME_DIR" --output-dir 'dist/Claude 中文生成器.app'
npm run build:dmg -- --app 'dist/Claude 中文生成器.app' --output 'dist/Claude 中文生成器-macOS.dmg'
scripts/verify-generator-bundle.sh 'dist/Claude 中文生成器.app'
node --test test/distribution.test.mjs && npm test && npm run package
```

Expected: app verification, DMG creation, 40 existing tests, new distribution tests, and npm packaging all pass.

- [ ] **Step 5: Commit distribution tooling**

```bash
git add scripts/build-dmg.sh scripts/verify-generator-bundle.sh package.json README.md test/distribution.test.mjs
git commit -m "feat: package graphical generator as macOS DMG"
```

### Task 5: Add release workflow and user-facing documentation

**Files:**
- Create: `.github/workflows/release-generator.yml`
- Modify: `README.md`
- Modify: `NOTICE`
- Create: `docs/GRAPHICAL-INSTALLER.md`
- Test: `test/release-manifest.test.mjs`

**Interfaces:**
- GitHub workflow accepts a version tag, downloads pinned Node arm64/x64 archives, runs the app and DMG builders, runs verification, and uploads both `.dmg` and `.tgz`.
- `docs/GRAPHICAL-INSTALLER.md` contains first launch, update, Gatekeeper, logs, rollback, Cockpit Tools, CC Switch, and usage-limit instructions.

- [ ] **Step 1: Write failing release-manifest tests**

Assert that workflow artifacts include exactly one DMG and one CLI tarball, release notes mention temporary signing and 3P/Cowork restrictions, and README instructions use the graphical path first while retaining CLI fallback.

- [ ] **Step 2: Run release-manifest tests to confirm RED**

Run: `node --test test/release-manifest.test.mjs`

Expected: workflow and graphical-installation documentation do not exist.

- [ ] **Step 3: Implement pinned runtime download and release workflow**

Pin Node version and SHA-256 values in workflow environment variables, verify archives before extraction, build both architectures, run all tests, and publish artifacts only after verification succeeds. Keep the existing `.tgz` release path unchanged.

- [ ] **Step 4: Write and test end-user documentation**

Document: download DMG, drag to Applications, first-open warning, inspection screen, explicit generation confirmation, update after Claude upgrades, configuration isolation, Cockpit/CC Switch routing, “无效安装” and 3P limitations, logs, and CLI fallback. Run the release-manifest tests and full suite.

- [ ] **Step 5: Commit release support**

```bash
git add .github/workflows/release-generator.yml README.md NOTICE docs/GRAPHICAL-INSTALLER.md test/release-manifest.test.mjs
git commit -m "docs: publish graphical installer workflow"
```

### Task 6: End-to-end clean-machine acceptance and release candidate

**Files:**
- Modify: `scripts/verify-generator-bundle.sh`
- Modify: `docs/GRAPHICAL-INSTALLER.md`
- Test: `test/e2e-generator.test.mjs`

**Interfaces:**
- `scripts/verify-generator-bundle.sh --clean-check <app>` runs the embedded CLI status path without relying on host Node or host project files.
- E2E acceptance records exit codes and a `Quality gate passed` line before release publication.

- [ ] **Step 1: Write the clean-machine acceptance harness**

Create a temporary HOME and disposable output directory, point the embedded CLI at a synthetic trusted-app fixture for non-destructive tests, and assert no writes occur under the official app fixture.

- [ ] **Step 2: Run the acceptance harness and capture evidence**

Run:

```bash
set -o pipefail
node --test test/e2e-generator.test.mjs 2>&1 | tee /tmp/claude-generator-quality-gate.log
printf '%s\n' ${pipestatus[1]} > /tmp/claude-generator-quality-gate.rc
```

Accept only when the recorded exit code is `0` and the log contains `Quality gate passed`.

- [ ] **Step 3: Perform manual macOS acceptance**

On a disposable user account without Node.js: open the DMG, launch the app, confirm the inspection screen, cancel once to verify no clone mutation, then generate, open the clone, inspect the manifest, and verify the official app signature before and after.

- [ ] **Step 4: Finalize release notes and publish**

Attach the verified DMG and CLI tarball to a new version tag only after the clean-machine gate passes. Include checksums, supported architectures, first-launch warning, and the temporary-signing/3P limitations.

- [ ] **Step 5: Commit acceptance evidence and handoff**

```bash
git add scripts/verify-generator-bundle.sh docs/GRAPHICAL-INSTALLER.md test/e2e-generator.test.mjs
git commit -m "test: verify graphical generator release candidate"
```
