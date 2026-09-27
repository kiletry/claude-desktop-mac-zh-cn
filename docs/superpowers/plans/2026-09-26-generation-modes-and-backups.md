# Claude Desktop macOS 生成模式与备份 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在保持独立副本 + 完整模式默认行为的前提下，增加官方包模式、安全翻译模式和可配置备份生命周期。

**Architecture:** 把应用模式、翻译模式和备份策略建模为 Node 核心生成器的显式配置；独立副本和官方包只在目标选择、备份、替换和最终验证上分流，共用资源补丁实现。SwiftUI 只收集配置、完成风险确认并把参数传递给 CLI。

**Tech Stack:** Node.js ESM、`node:test`、Electron ASAR、SwiftUI、Swift Package Manager。

**Spec:** `docs/superpowers/specs/2026-09-26-generation-modes-and-backups-design.md`

## Global Constraints

- 默认必须是 `app-mode=clone`、`translation-mode=full`、`backup-policy=versioned`、`backup-count=1`。
- 官方应用在官方模式外不得写入；官方模式失败必须尽力从本次备份恢复。
- 备份只删除本工具生成且位于用户选择目录中的文件。
- CLI、GUI 共用 `src/` 生成逻辑。
- 安全模式不得修改结构性 `app.asar` runtime/preload，也不得更新 `ElectronAsarIntegrity`。

## Review Focus

- 官方模式未确认或确认被取消：CLI 拒绝，GUI 不启动子进程（Task 3）。
- 备份复制/校验失败：补丁不开始，原目标不被覆盖（Task 1）。
- 版本化清理遇到非本工具文件：只清理带 manifest 的旧备份（Task 1）。
- 安全模式：资源和静态补丁存在，runtime/preload 和 ASAR integrity 不变（Task 2）。
- 官方模式补丁失败：备份保留并尝试恢复，结果包含两类错误（Task 2）。

### Task 1: 备份管理与配置验证

**Files:**
- Create: `src/backup-manager.mjs`
- Modify: `src/errors.mjs`
- Test: `test/backup-manager.test.mjs`

**Interfaces:**
- Produces `normalizeGenerationOptions(options)`, `createBackup({ sourcePath, backupDir, policy, count, metadata, fsOps })`, and `pruneBackups({ backupDir, count, fsOps })`.
- Backup results include path, policy, count and manifest path.

- [ ] Write failing tests for defaults, invalid options, overwrite naming, versioned naming, manifest validation, pruning, and refusal to remove unrelated files.
- [ ] Run `node --test test/backup-manager.test.mjs` and verify expected failures.
- [ ] Implement the backup module with temp-copy/atomic-rename semantics and path-scope checks.
- [ ] Run the focused tests and then `npm test`.
- [ ] Commit `feat: add configurable app backup manager`.

### Task 2: Shared generation modes and official package path

**Files:**
- Modify: `src/localized-clone.mjs`
- Modify: `src/cli.mjs`
- Modify: `src/generator-events.mjs`
- Modify: `test/localized-clone.test.mjs`
- Modify: `test/cli.test.mjs`

**Interfaces:**
- `buildLocalizedClone({ appMode, translationMode, backupDir, backupPolicy, backupCount, confirmOfficialModification, ... })` remains the shared entry point.
- Result includes `appMode`, `translationMode`, `backup`, and `verificationTarget`.

- [ ] Add failing tests proving default options, CLI parsing, safe-mode skipping of `patchPackagedRuntime`, clone backup behavior, official confirmation requirement, and official restore-on-failure.
- [ ] Run focused tests and verify they fail for missing mode behavior.
- [ ] Refactor resource application so full-only ASAR work is conditional while resource/static patching is shared.
- [ ] Implement official target staging, backup-before-write, replacement, ad-hoc signing, and restore-on-failure without changing the official path in clone mode.
- [ ] Add CLI flags and JSON event/result fields; enforce `--confirm-official-modification` for official mode.
- [ ] Run focused tests and full `npm test`.
- [ ] Commit `feat: support official and safe generation modes`.

### Task 3: SwiftUI configuration and risk confirmation

**Files:**
- Modify: `installer-macos/Sources/ClaudeChineseGenerator/GeneratorState.swift`
- Modify: `installer-macos/Sources/ClaudeChineseGenerator/GeneratorViewModel.swift`
- Modify: `installer-macos/Sources/ClaudeChineseGenerator/GeneratorApp.swift`
- Modify: `installer-macos/Tests/GeneratorStateTests.swift`

**Interfaces:**
- Add `AppMode`, `TranslationMode`, `BackupPolicy`, and `GenerationConfiguration` Codable/Equatable models.
- ViewModel exposes configuration bindings and only generates after official confirmation when required.

- [ ] Add failing Swift tests for default configuration, generated argument list, and cancellation of official confirmation.
- [ ] Run `swift test` and verify failures.
- [ ] Add controls for mode, translation, backup directory, policy and count; use NSOpenPanel for backup directory selection.
- [ ] Add official-mode warning/confirmation and pass controlled CLI arguments including confirmation.
- [ ] Run `swift test` and build the generator package if the local Xcode license permits.
- [ ] Commit `feat: expose generation configuration in macOS installer`.

### Task 4: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/GRAPHICAL-INSTALLER.md`
- Modify: `test/distribution.test.mjs`

- [ ] Add failing documentation/distribution assertions for the new defaults and CLI options.
- [ ] Update CLI examples, GUI behavior, backup safety, official-mode risks, and safe-mode limitations.
- [ ] Run `npm test`, `npm run package`, and available Swift tests/build checks.
- [ ] Review `git diff --check` and inspect generated help output.
- [ ] Commit `docs: document generation modes and backups`.
