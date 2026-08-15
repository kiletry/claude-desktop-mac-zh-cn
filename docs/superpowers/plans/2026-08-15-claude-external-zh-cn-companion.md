# Claude Desktop Offline Chinese Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only macOS companion that overlays Simplified Chinese labels on Claude Desktop interface controls without modifying `Claude.app`.

**Architecture:** A Swift menu-bar app filters only Claude Accessibility controls, maps eligible interface text through a bundled JSON dictionary, and renders click-through overlay panels. The Node CLI builds and launches only the companion, verifying Claude's signature and Gatekeeper assessment before and after every action.

**Tech Stack:** macOS 13+, Swift 5.9, SwiftUI, AppKit, ApplicationServices, XCTest, Node.js 18+ ESM, `node:test`, `codesign`, `spctl`.

## Global Constraints

- Never write, re-sign, alter permissions, or remove attributes inside `Claude.app`.
- Never transmit, persist, or translate chats, prompts, attachments, or transcripts.
- Use bundled JSON; make no runtime network request.
- Translate only strict allowlisted UI roles and parent regions; unknown text stays English.
- Support only `com.anthropic.claudefordesktop`, macOS 13+, and user-controlled Accessibility permission.
- Overlay panels ignore mouse events and are cleared when target or companion becomes inactive.
- Verify `codesign --verify --deep --strict` and `spctl --assess --type execute` before and after every companion action.

---

## File Structure

- `companion-macos/Package.swift`: Swift package.
- `companion-macos/Sources/CompanionCore/`: data model, eligibility filter, dictionary, layout.
- `companion-macos/Sources/ClaudeChineseCompanion/`: menu bar, AX monitor, permission state, panels.
- `companion-macos/Sources/CompanionCore/Resources/zh-CN.json`: local dictionary.
- `companion-macos/Tests/CompanionCoreTests/`: XCTest unit and integration seams.
- `scripts/build-companion.mjs`, `src/companion.mjs`: local build, bundle assembly, launch.
- `src/claude-inspector.mjs`, `src/cli.mjs`: signature assessment and safe CLI.
- `test/*.test.mjs`, `README.md`, `NOTICE`, `docs/companion-permissions.md`: Node verification and documentation.

---

### Task 1: Retire every Claude resource mutation

**Files:**
- Modify: `src/claude-inspector.mjs`, `src/cli.mjs`, `test/inspector.test.mjs`, `test/cli.test.mjs`, `README.md`

**Interfaces:**
- `inspectClaudeApp(appDir, { execFile }) -> Promise<{ appDir, bundleId, version, signing, gatekeeper }>`.
- `runCli(['status' | 'build-companion' | 'launch-companion'], dependencies) -> Promise<number>`.

- [ ] **Step 1: Write the failing inspection test**

```js
test('reports official bundle and Gatekeeper assessment', async () => {
  const result = await inspectClaudeApp(appDir, { execFile: fakeMacCommand });
  assert.equal(result.bundleId, 'com.anthropic.claudefordesktop');
  assert.equal(result.signing.verified, true);
  assert.equal(result.gatekeeper.accepted, true);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --test-name-pattern='official bundle'`  
Expected: FAIL because `bundleId` and `gatekeeper` are absent.

- [ ] **Step 3: Implement read-only assessment**

Read the bundle identifier with `plutil`, reject any non-Claude bundle, and add `spctl --assess --type execute --verbose=2` beside the current `codesign` check. Return failure as status information and require both checks for build/launch.

- [ ] **Step 4: Write the failing retired-command test**

```js
test('install rejects legacy patching before mutation is called', async () => {
  await assert.rejects(runCli(['install'], {
    applyTransaction: async () => { throw new Error('must not write'); },
  }), (error) => error instanceof UserError && /retired.*Claude\.app/i.test(error.message));
});
```

- [ ] **Step 5: Implement safe CLI surface**

Expose only `status`, `build-companion`, and `launch-companion`. Make `install`, `update`, and `restore` reject with the safety explanation. Delete active imports and runtime calls for upstream downloads, locale patches, preference writes, and transactions.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test -- --test-name-pattern='official bundle|legacy patch|status'`  
Expected: PASS.  
Commit: `git add src/claude-inspector.mjs src/cli.mjs test/inspector.test.mjs test/cli.test.mjs README.md && git commit -m "fix: retire Claude resource patching"`.

### Task 2: Implement the offline dictionary and privacy filter

**Files:**
- Create: `companion-macos/Package.swift`
- Create: `companion-macos/Sources/CompanionCore/AccessibilityElement.swift`
- Create: `companion-macos/Sources/CompanionCore/InterfaceEligibility.swift`
- Create: `companion-macos/Sources/CompanionCore/TranslationDictionary.swift`
- Create: `companion-macos/Sources/CompanionCore/Resources/zh-CN.json`
- Create: `companion-macos/Tests/CompanionCoreTests/InterfaceEligibilityTests.swift`
- Create: `companion-macos/Tests/CompanionCoreTests/TranslationDictionaryTests.swift`

**Interfaces:**
- `struct AccessibilityElement { let role: String; let title: String?; let value: String?; let parentRole: String?; let frame: CGRect }`.
- `InterfaceEligibility.allows(_:) -> Bool`.
- `TranslationDictionary(resourceURL:)` and `translation(for:) -> String?`.

- [ ] **Step 1: Write the failing privacy test**

```swift
func testAllowsSettingsButtonAndRejectsConversationContent() {
    XCTAssertTrue(InterfaceEligibility.allows(.init(role: "AXButton", title: "Settings", value: nil, parentRole: "AXToolbar", frame: .zero)))
    XCTAssertFalse(InterfaceEligibility.allows(.init(role: "AXTextArea", title: nil, value: "private prompt", parentRole: "AXWebArea", frame: .zero)))
    XCTAssertFalse(InterfaceEligibility.allows(.init(role: "AXStaticText", title: "chat message", value: nil, parentRole: "AXWebArea", frame: .zero)))
}
```

- [ ] **Step 2: Verify RED**

Run: `cd companion-macos && swift test --filter InterfaceEligibilityTests`  
Expected: FAIL because `CompanionCore` does not exist.

- [ ] **Step 3: Implement fail-closed eligibility**

Allow `AXMenuItem`, `AXButton`, `AXCheckBox`, `AXRadioButton`, `AXTab`, and static labels only under a menu, toolbar, dialog, group, or settings region. Always reject `AXWebArea`, text input, message/list rows, and unknown parent regions.

- [ ] **Step 4: Write dictionary lookup RED test, then implement**

```swift
func testUsesContextSpecificTranslationAndLeavesUnknownTextEnglish() throws {
    let dictionary = try TranslationDictionary(resourceURL: fixtureURL)
    let settings = AccessibilityElement(role: "AXButton", title: "Settings", value: nil, parentRole: "AXToolbar", frame: .zero)
    XCTAssertEqual(dictionary.translation(for: settings), "设置")
    XCTAssertNil(dictionary.translation(for: .init(role: "AXButton", title: "Unseen control", value: nil, parentRole: "AXToolbar", frame: .zero)))
}
```

Use `Codable` entries `{ source, role?, parentRole?, target }`; call the eligibility filter before lookup. Package only navigation, settings, account, and menu terms.

- [ ] **Step 5: Verify GREEN and commit**

Run: `cd companion-macos && swift test`  
Expected: PASS.  
Commit: `git add companion-macos && git commit -m "feat: add offline companion translation core"`.

### Task 3: Render safe Chinese overlays

**Files:**
- Create: `companion-macos/Sources/CompanionCore/OverlayLayout.swift`
- Create: `companion-macos/Sources/ClaudeChineseCompanion/OverlayPanel.swift`
- Create: `companion-macos/Sources/ClaudeChineseCompanion/OverlayCoordinator.swift`
- Create: `companion-macos/Tests/CompanionCoreTests/OverlayLayoutTests.swift`

**Interfaces:**
- `struct OverlayLabel { let text: String; let frame: CGRect }`.
- `OverlayLayout.labels(for:screenFrame:) -> [OverlayLabel]`.
- `OverlayCoordinator.render(_:)`, `OverlayCoordinator.clear()`.

- [ ] **Step 1: Write the failing geometry test**

```swift
func testKeepsChineseLabelOnScreen() {
    let button = AccessibilityElement(role: "AXButton", title: "Settings", value: nil, parentRole: "AXToolbar", frame: CGRect(x: 8, y: 4, width: 80, height: 28))
    let label = OverlayLayout.labels(for: [(button, "设置")], screenFrame: CGRect(x: 0, y: 0, width: 320, height: 200)).single!
    XCTAssertGreaterThanOrEqual(label.frame.minX, 0)
    XCTAssertGreaterThanOrEqual(label.frame.minY, 0)
    XCTAssertLessThanOrEqual(label.frame.maxY, 200)
}
```

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

Run RED: `cd companion-macos && swift test --filter OverlayLayoutTests`.  
Implement a pure layout function that positions above/below and clamps to screen bounds. Implement transparent borderless floating `NSPanel`s with `ignoresMouseEvents = true`, no key/main capability, reuse in `render`, and full close in `clear`.  
Run GREEN: `cd companion-macos && swift test`.  
Expected: PASS; manually verify a click reaches Claude's original control.

- [ ] **Step 3: Commit**

Commit: `git add companion-macos/Sources companion-macos/Tests && git commit -m "feat: render click-through Chinese overlays"`.

### Task 4: Add bounded Accessibility monitoring and menu-bar state

**Files:**
- Create: `companion-macos/Sources/ClaudeChineseCompanion/ClaudeAccessibilityMonitor.swift`
- Create: `companion-macos/Sources/ClaudeChineseCompanion/PermissionState.swift`
- Create: `companion-macos/Sources/ClaudeChineseCompanion/CompanionApp.swift`
- Create: `companion-macos/Tests/CompanionCoreTests/ClaudeAccessibilityMonitorTests.swift`

**Interfaces:**
- `ClaudeAccessibilityMonitor(bundleIdentifier:dictionary:coordinator:targetResolver:)` with `start()`, `stop()`, and `refresh()`.
- `PermissionState.accessibility() -> .granted | .missing`.

- [ ] **Step 1: Write failing missing-target test**

```swift
func testRefreshClearsOverlaysWhenClaudeIsNotRunning() {
    let coordinator = RecordingCoordinator()
    let monitor = ClaudeAccessibilityMonitor(bundleIdentifier: "com.anthropic.claudefordesktop", dictionary: fixtureDictionary, coordinator: coordinator, targetResolver: { nil })
    monitor.refresh()
    XCTAssertEqual(coordinator.clearCount, 1)
}
```

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

Run RED: `cd companion-macos && swift test --filter ClaudeAccessibilityMonitorTests`.  
Resolve only the official running bundle, walk a bounded focused-window AX tree, translate eligible controls locally, discard raw strings after every refresh, and debounce focus/menu/window/layout notifications by 100 ms. Implement menu-bar states `需要辅助功能权限`, `等待 Claude`, and `已启用`; only request the standard system permission prompt, never grant it. Toggling off clears all panels.  
Run GREEN: `cd companion-macos && swift test`.  
Expected: PASS; manually verify menus/settings translate while prompt/transcript do not.

- [ ] **Step 3: Commit**

Commit: `git add companion-macos && git commit -m "feat: monitor Claude interface safely"`.

### Task 5: Package companion, document privacy, and accept

**Files:**
- Create: `scripts/build-companion.mjs`, `src/companion.mjs`, `test/companion.test.mjs`, `docs/companion-permissions.md`
- Modify: `src/cli.mjs`, `test/cli.test.mjs`, `package.json`, `install.sh`, `README.md`, `NOTICE`

**Interfaces:**
- `buildCompanion({ execFile, projectDir, outputDir }) -> Promise<{ appPath, executablePath }>`.
- `launchCompanion({ execFile, appPath }) -> Promise<void>`.

- [ ] **Step 1: Write the failing build test**

```js
test('build invokes Swift and targets only the companion bundle', async () => {
  const calls = [];
  const result = await buildCompanion({ projectDir: '/repo/companion-macos', outputDir: '/repo/dist', execFile: async (file, args) => { calls.push([file, args]); return { stdout: '', stderr: '' }; } });
  assert.equal(result.appPath, '/repo/dist/Claude Chinese Companion.app');
  assert.deepEqual(calls[0], ['/usr/bin/xcrun', ['swift', 'build', '-c', 'release']]);
});
```

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

Run RED: `npm test -- --test-name-pattern='build invokes Swift'`.  
Implement `/usr/bin/xcrun swift build -c release`, bundle only the release companion executable/resources into `dist/Claude Chinese Companion.app`, and launch only that path with `/usr/bin/open`. `build-companion` and `launch-companion` inspect Claude before and after the action and fail clearly without Command Line Tools.  
Run GREEN: `npm test && npm run package && cd companion-macos && swift test`.  
Expected: all checks pass.

- [ ] **Step 3: Update docs and perform manual acceptance**

Remove all `--accept-signature-risk`, patch, restore, and runtime upstream-fetch instructions. Document offline dictionary updates and exact Accessibility scope. Run:

```bash
rg -n -- '--accept-signature-risk|applyTransaction|downloadTranslation' README.md NOTICE src install.sh
npm test
npm run package
cd companion-macos && swift test
```

Then run `./install.sh status`, `./install.sh build-companion`, and `./install.sh launch-companion`; grant Accessibility through System Settings; confirm `/Applications/Claude.app` remains signed and direct-launched; verify a menu item and Settings translate; verify prompt/transcript are untouched; disable the toggle and verify every label clears.

- [ ] **Step 4: Commit**

Commit: `git add scripts src test companion-macos README.md NOTICE docs package.json install.sh && git commit -m "feat: deliver offline Claude Chinese companion"`.

## Plan Self-Review

- Spec coverage: Tasks 1 and 5 prohibit application mutation and verify Claude integrity; Tasks 2–4 provide offline translation, strict chat exclusion, permission handling, and click-through overlays.
- Placeholder scan: no unfinished markers or unspecified test/action remains.
- Type consistency: `AccessibilityElement` feeds eligibility, dictionary, and layout; `OverlayLabel` feeds the coordinator; Node uses `inspectClaudeApp`, `buildCompanion`, and `launchCompanion` consistently.
