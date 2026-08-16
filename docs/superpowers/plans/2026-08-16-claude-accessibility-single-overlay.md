# Claude Accessibility Single-Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the partial OCR sticker overlay with an accessibility-driven, single-surface Chinese interface layer for static Claude sidebar and toolbar controls.

**Architecture:** Read control metadata from the official Claude process through macOS Accessibility, apply a fail-closed static-control and region policy, translate through the packaged local dictionary, and draw all accepted labels in one click-through `NSPanel`. Remove the runtime OCR path and keep `/Applications/Claude.app` inspection-only.

**Tech Stack:** Swift 5.9, AppKit, CoreText, ApplicationServices Accessibility API, Swift Package Manager, Node.js 18+, macOS code signing tools.

## Global Constraints

- Target macOS 13 or newer.
- Never modify, copy, re-sign, patch, or remove attributes from `/Applications/Claude.app`.
- Only `com.anthropic.claudefordesktop` is a valid target process.
- Only the leftmost 30% and topmost 14% of a Claude window are eligible.
- Never translate or persist chat messages, prompts, attachments, conversation titles, user names, or other user-generated content.
- Never send Claude window text to a network service.
- Unknown or ambiguous controls stay English.
- Runtime text discovery uses Accessibility only; Vision OCR and Screen Recording are retired.
- Render one overlay panel per Claude window, not one panel per label.
- The overlay ignores mouse input and hides whenever Claude is not frontmost.
- Keep the stable designated requirement `identifier "com.kiletry.claude-chinese-companion"` for companion updates.
- Current Command Line Tools lack XCTest; write XCTest coverage and also maintain a runnable `Tests/main.swift` acceptance executable for this machine.

---

### Task 1: Define the fail-closed static-control policy

**Files:**
- Create: `companion-macos/Sources/CompanionCore/StaticInterfacePolicy.swift`
- Create: `companion-macos/Sources/CompanionCore/AccessibilityZonePolicy.swift`
- Modify: `companion-macos/Sources/CompanionCore/AccessibilityElement.swift`
- Create: `companion-macos/Tests/CompanionCoreTests/StaticInterfacePolicyTests.swift`
- Modify: `companion-macos/Tests/main.swift`
- Create: `companion-macos/Tests/run-smoke-tests.zsh`

**Interfaces:**
- Consumes: raw Accessibility role, title, value, identifier, enabled state, parent role, ancestor roles, and global top-left frame.
- Produces: `StaticInterfacePolicy.mayReadText(role:ancestorRoles:) -> Bool` so rejected content containers are filtered before title/value access.
- Produces: `StaticInterfacePolicy.allows(_ element: AccessibilityElement, windowFrame: CGRect) -> Bool`.
- Produces: `AccessibilityZonePolicy.permits(frame: CGRect, in windowFrame: CGRect) -> Bool`.

- [ ] **Step 1: Extend the Accessibility element model in the failing tests**

```swift
let window = CGRect(x: 0, y: 0, width: 1_200, height: 900)
let projects = AccessibilityElement(
    role: "AXButton",
    title: "Projects",
    value: nil,
    identifier: "sidebar-projects",
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXGroup", "AXWebArea", "AXGroup"],
    frame: CGRect(x: 20, y: 200, width: 180, height: 28)
)
XCTAssertTrue(StaticInterfacePolicy.allows(projects, windowFrame: window))

let conversationTitle = AccessibilityElement(
    role: "AXButton",
    title: "Projects",
    value: nil,
    identifier: nil,
    isEnabled: true,
    parentRole: "AXList",
    ancestorRoles: ["AXWindow", "AXWebArea", "AXList"],
    frame: CGRect(x: 20, y: 400, width: 180, height: 28)
)
XCTAssertFalse(StaticInterfacePolicy.allows(conversationTitle, windowFrame: window))
```

- [ ] **Step 2: Run the RED checks**

Run:

```bash
cd companion-macos
xcrun swift test --filter StaticInterfacePolicyTests
```

Expected on a full Xcode installation: compile failure because `identifier`, `ancestorRoles`, `StaticInterfacePolicy`, and `AccessibilityZonePolicy` do not exist. On the current machine, record the existing `no such module 'XCTest'` environment limitation, then run the smoke executable after the implementation in Step 6.

- [ ] **Step 3: Add the exact safe-copy allowlist and rejected roles**

```swift
public enum StaticInterfacePolicy {
    private static let allowedCopy: Set<String> = [
        "Home", "Code", "New", "Projects", "Artifacts", "Customize",
        "Chats and tasks", "View all", "Filter and group recents",
        "Import memory", "Dismiss this suggestion", "Get apps and extensions",
        "Search", "Collapse sidebar", "Search projects", "Sort projects",
        "New project", "Settings", "Back", "Forward", "Help"
    ]
    private static let allowedRoles: Set<String> = [
        "AXButton", "AXMenuButton", "AXPopUpButton", "AXCheckBox",
        "AXRadioButton", "AXTab", "AXStaticText"
    ]
    private static let rejectedRoles: Set<String> = [
        "AXTextArea", "AXTextField", "AXSearchField", "AXDocument",
        "AXList", "AXTable", "AXRow", "AXCell", "AXOutline"
    ]

    public static func mayReadText(role: String, ancestorRoles: [String]) -> Bool {
        !rejectedRoles.contains(role) && !ancestorRoles.contains(where: rejectedRoles.contains)
    }

    public static func allows(_ element: AccessibilityElement, windowFrame: CGRect) -> Bool {
        guard allowedRoles.contains(element.role),
              mayReadText(role: element.role, ancestorRoles: element.ancestorRoles),
              AccessibilityZonePolicy.permits(frame: element.frame, in: windowFrame) else {
            return false
        }
        return [element.title, element.value]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .contains(where: allowedCopy.contains)
    }
}
```

- [ ] **Step 4: Implement the exact 30% / 14% region policy**

```swift
public enum AccessibilityZonePolicy {
    public static func permits(frame: CGRect, in windowFrame: CGRect) -> Bool {
        guard !frame.isEmpty, frame.intersects(windowFrame), !windowFrame.isEmpty else { return false }
        let relativeX = (frame.midX - windowFrame.minX) / windowFrame.width
        let relativeTop = (frame.midY - windowFrame.minY) / windowFrame.height
        return relativeX <= 0.30 || relativeTop <= 0.14
    }
}
```

`AccessibilityElement` must expose this complete initializer so every later task uses the same model:

```swift
public init(
    role: String,
    title: String?,
    value: String?,
    identifier: String?,
    isEnabled: Bool?,
    parentRole: String?,
    ancestorRoles: [String],
    frame: CGRect
)
```

- [ ] **Step 5: Add the Command Line Tools smoke-test runner**

`Tests/main.swift` imports `CompanionCore` and contains `precondition` checks for every pure policy and layout behavior added by the current task. Create this executable runner:

```zsh
#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h:h}
cd "$project_dir"
/usr/bin/swift build -c release
build_dir=$(/usr/bin/swift build -c release --show-bin-path)
smoke_dir=$(mktemp -d /tmp/claude-companion-smoke.XXXXXX)
smoke_binary="$smoke_dir/smoke-tests"
trap 'rm -rf "$smoke_dir"' EXIT

/usr/bin/swiftc \
  -I "$build_dir/Modules" \
  Tests/main.swift \
  "$build_dir"/CompanionCore.build/*.o \
  -framework CoreGraphics \
  -o "$smoke_binary"
"$smoke_binary"
```

Run `chmod +x Tests/run-smoke-tests.zsh` after creating the file.

- [ ] **Step 6: Verify GREEN and the privacy exclusions**

Run:

```bash
cd companion-macos
swift build -c release
Tests/run-smoke-tests.zsh
```

Expected: build succeeds; manual executable exits 0; sidebar and toolbar fixtures pass; central, editable, list, and user-title fixtures are rejected.

- [ ] **Step 7: Commit the policy boundary**

```bash
git add companion-macos/Sources/CompanionCore/AccessibilityElement.swift \
  companion-macos/Sources/CompanionCore/AccessibilityZonePolicy.swift \
  companion-macos/Sources/CompanionCore/StaticInterfacePolicy.swift \
  companion-macos/Tests/CompanionCoreTests/StaticInterfacePolicyTests.swift \
  companion-macos/Tests/main.swift \
  companion-macos/Tests/run-smoke-tests.zsh
git commit -m "feat: add safe accessibility control policy"
```

---

### Task 2: Build coordinate conversion and Chinese text patches

**Files:**
- Create: `companion-macos/Sources/CompanionCore/AccessibilityCoordinateMapper.swift`
- Create: `companion-macos/Sources/CompanionCore/OverlaySurface.swift`
- Replace: `companion-macos/Sources/CompanionCore/OverlayLayout.swift`
- Modify: `companion-macos/Tests/CompanionCoreTests/OverlayLayoutTests.swift`
- Modify: `companion-macos/Tests/main.swift`

**Interfaces:**
- Consumes: global top-left Accessibility frames, matching Quartz/AppKit display frames, a Claude window ID and frame, translated text, enabled state, and appearance.
- Produces: `DisplayGeometry(accessibilityFrame:appKitFrame:)` and `AccessibilityCoordinateMapper.appKitFrame(_:on:) -> CGRect`.
- Produces: `OverlayLayout.patch(controlFrame:text:isEnabled:) -> OverlayPatch?` where `controlFrame` is panel-local.
- Produces: `OverlayLayout.surface(windowID:windowFrame:display:appearance:translations:) -> OverlaySurface?`.

- [ ] **Step 1: Write the failing coordinate and patch tests**

```swift
func testConvertsTopLeftAccessibilityFrameToAppKitCoordinates() {
    let result = AccessibilityCoordinateMapper.appKitFrame(
        CGRect(x: 20, y: 100, width: 180, height: 28),
        on: DisplayGeometry(
            accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
            appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
        )
    )
    XCTAssertEqual(result, CGRect(x: 20, y: 952, width: 180, height: 28))
}

func testChinesePatchFitsInsideControlAndAvoidsIcon() {
    let patch = OverlayLayout.patch(
        controlFrame: CGRect(x: 12, y: 20, width: 210, height: 28),
        text: "项目",
        isEnabled: true
    )
    XCTAssertEqual(patch?.frame.minX, 44)
    XCTAssertLessThanOrEqual(patch!.frame.maxX, 214)
    XCTAssertGreaterThanOrEqual(patch!.frame.width, 40)
}

func testPatchRejectsTextThatWouldClip() {
    XCTAssertNil(OverlayLayout.patch(
        controlFrame: CGRect(x: 12, y: 20, width: 90, height: 28),
        text: "筛选并分组最近记录",
        isEnabled: true
    ))
}
```

- [ ] **Step 2: Run the RED checks**

Run:

```bash
cd companion-macos
xcrun swift test --filter OverlayLayoutTests
```

Expected on full Xcode: compile failure for missing coordinate mapper and overlay surface types. Record the XCTest environment limitation on this machine.

- [ ] **Step 3: Implement the rendering model**

```swift
public enum OverlayAppearance: Equatable, Sendable { case light, dark }

public struct OverlayPatch: Equatable, Sendable {
    public let text: String
    public let frame: CGRect
    public let isEnabled: Bool

    public init(text: String, frame: CGRect, isEnabled: Bool) {
        self.text = text
        self.frame = frame
        self.isEnabled = isEnabled
    }
}

public struct OverlaySurface: Equatable, Sendable {
    public let windowID: CGWindowID
    public let frame: CGRect
    public let appearance: OverlayAppearance
    public let patches: [OverlayPatch]

    public init(windowID: CGWindowID, frame: CGRect, appearance: OverlayAppearance, patches: [OverlayPatch]) {
        self.windowID = windowID
        self.frame = frame
        self.appearance = appearance
        self.patches = patches
    }
}
```

The display mapper must use both coordinate spaces so displays above, below, or beside the primary display remain correct:

```swift
public struct DisplayGeometry: Equatable, Sendable {
    public let accessibilityFrame: CGRect
    public let appKitFrame: CGRect

    public init(accessibilityFrame: CGRect, appKitFrame: CGRect) {
        self.accessibilityFrame = accessibilityFrame
        self.appKitFrame = appKitFrame
    }
}

public enum AccessibilityCoordinateMapper {
    public static func appKitFrame(_ frame: CGRect, on display: DisplayGeometry) -> CGRect {
        let ax = display.accessibilityFrame
        let appKit = display.appKitFrame
        guard !frame.isEmpty, !ax.isEmpty, !appKit.isEmpty else { return .null }
        let scaleX = appKit.width / ax.width
        let scaleY = appKit.height / ax.height
        return CGRect(
            x: appKit.minX + (frame.minX - ax.minX) * scaleX,
            y: appKit.maxY - (frame.maxY - ax.minY) * scaleY,
            width: frame.width * scaleX,
            height: frame.height * scaleY
        )
    }
}
```

- [ ] **Step 4: Implement patch geometry without clipping**

Use a 32-point leading inset for sidebar icons, an 8-point trailing margin, a minimum 40-point text width, and the existing control height. Measure the rendered Chinese string with the same 13-point medium system font used by the canvas. Return `nil` if the safe patch would leave the control bounds, overlap a trailing affordance, or clip the measured text.

```swift
public static func patch(controlFrame: CGRect, text: String, isEnabled: Bool) -> OverlayPatch? {
    guard !text.isEmpty, !controlFrame.isEmpty else { return nil }
    guard let font = CTFontCreateUIFontForLanguage(.system, 13, nil) else { return nil }
    let attributed = NSAttributedString(
        string: text,
        attributes: [kCTFontAttributeName as NSAttributedString.Key: font]
    )
    let measuredWidth = ceil(CGFloat(CTLineGetTypographicBounds(
        CTLineCreateWithAttributedString(attributed),
        nil,
        nil,
        nil
    ))) + 4
    let textFrame = CGRect(
        x: controlFrame.minX + 32,
        y: controlFrame.minY + 2,
        width: controlFrame.width - 40,
        height: controlFrame.height - 4
    )
    guard textFrame.width >= 40,
          measuredWidth <= textFrame.width,
          textFrame.minX >= controlFrame.minX,
          textFrame.maxX <= controlFrame.maxX - 8,
          textFrame.minY >= controlFrame.minY,
          textFrame.maxY <= controlFrame.maxY else { return nil }
    return OverlayPatch(text: text, frame: textFrame, isEnabled: isEnabled)
}
```

`OverlayLayout.swift` imports `CoreText`. `surface(...)` converts the window and every accepted control to AppKit, subtracts the converted window origin so patch frames are panel-local, rejects patches outside the window, and returns `nil` for an empty patch list:

```swift
public static func surface(
    windowID: CGWindowID,
    windowFrame: CGRect,
    display: DisplayGeometry,
    appearance: OverlayAppearance,
    translations: [(AccessibilityElement, String)]
) -> OverlaySurface? {
    let appKitWindow = AccessibilityCoordinateMapper.appKitFrame(windowFrame, on: display)
    guard !appKitWindow.isNull, !appKitWindow.isEmpty else { return nil }
    let localBounds = CGRect(origin: .zero, size: appKitWindow.size)
    let patches = translations.compactMap { element, text -> OverlayPatch? in
        let appKitControl = AccessibilityCoordinateMapper.appKitFrame(element.frame, on: display)
        guard !appKitControl.isNull, !appKitControl.isEmpty else { return nil }
        let localControl = CGRect(
            x: appKitControl.minX - appKitWindow.minX,
            y: appKitControl.minY - appKitWindow.minY,
            width: appKitControl.width,
            height: appKitControl.height
        )
        guard localBounds.contains(localControl) else { return nil }
        return patch(controlFrame: localControl, text: text, isEnabled: element.isEnabled != false)
    }
    guard !patches.isEmpty else { return nil }
    return OverlaySurface(
        windowID: windowID,
        frame: appKitWindow,
        appearance: appearance,
        patches: patches
    )
}
```

- [ ] **Step 5: Verify GREEN including scaled-screen fixtures**

Run:

```bash
cd companion-macos
swift build -c release
Tests/run-smoke-tests.zsh
```

Expected: executable exits 0 for primary and scaled display fixtures; every patch remains within its control and window bounds.

- [ ] **Step 6: Commit geometry and models**

```bash
git add companion-macos/Sources/CompanionCore/AccessibilityCoordinateMapper.swift \
  companion-macos/Sources/CompanionCore/OverlaySurface.swift \
  companion-macos/Sources/CompanionCore/OverlayLayout.swift \
  companion-macos/Tests/CompanionCoreTests/OverlayLayoutTests.swift \
  companion-macos/Tests/main.swift
git commit -m "feat: add native Chinese overlay geometry"
```

---

### Task 3: Replace per-label panels with one canvas panel

**Files:**
- Create: `companion-macos/Sources/ClaudeChineseCompanion/OverlayCanvasView.swift`
- Replace: `companion-macos/Sources/ClaudeChineseCompanion/OverlayPanel.swift`
- Modify: `companion-macos/Sources/ClaudeChineseCompanion/OverlayCoordinator.swift`
- Modify: `companion-macos/Sources/ClaudeChineseCompanion/ClaudeAccessibilityMonitor.swift` protocol declaration only
- Create: `companion-macos/Tests/CompanionCoreTests/OverlayCoordinatorTests.swift`

**Interfaces:**
- Consumes: one `OverlaySurface` per refresh.
- Produces: `OverlayRendering.render(_ surface: OverlaySurface)` and `OverlayRendering.clear()`.
- Produces: internal `OverlayPanelManaging.update(_:)`, `show()`, and `hide()` seams for deterministic coordinator tests.
- Maintains: at most one retained panel per `OverlaySurface.windowID`; rendering a focused window hides panels for every other window ID, so only one overlay is visible at a time.

- [ ] **Step 1: Write the failing single-panel tests**

```swift
@MainActor
func testRepeatedRendersReuseOnePanel() {
    let factory = RecordingOverlayPanelFactory()
    let coordinator = OverlayCoordinator(panelFactory: factory.make(surface:))
    coordinator.render(makeSurface(texts: ["首页", "项目"]))
    coordinator.render(makeSurface(texts: ["首页", "项目", "制品"]))
    XCTAssertEqual(factory.createdPanels.count, 1)
    XCTAssertEqual(factory.createdPanels[0].surfaces.count, 2)
}

@MainActor
func testSwitchingClaudeWindowsHidesThePreviousPanel() {
    let factory = RecordingOverlayPanelFactory()
    let coordinator = OverlayCoordinator(panelFactory: factory.make(surface:))
    coordinator.render(makeSurface(windowID: 42, texts: ["首页"]))
    coordinator.render(makeSurface(windowID: 84, texts: ["项目"]))
    XCTAssertEqual(factory.createdPanels.count, 2)
    XCTAssertEqual(factory.createdPanels[0].hideCount, 1)
    XCTAssertEqual(factory.createdPanels[1].showCount, 1)
}

@MainActor
func testPanelRemainsVisibleWhenCompanionDeactivates() {
    let panel = OverlayPanel(surface: makeSurface(texts: ["首页"]))
    XCTAssertFalse(panel.hidesOnDeactivate)
    XCTAssertTrue(panel.ignoresMouseEvents)
    XCTAssertFalse(panel.canBecomeKey)
}

private func makeSurface(windowID: CGWindowID = 42, texts: [String]) -> OverlaySurface {
    OverlaySurface(
        windowID: windowID,
        frame: CGRect(x: 100, y: 100, width: 600, height: 500),
        appearance: .light,
        patches: texts.enumerated().map { index, text in
            OverlayPatch(
                text: text,
                frame: CGRect(x: 40, y: 440 - index * 32, width: 120, height: 24),
                isEnabled: true
            )
        }
    )
}

@MainActor
private final class RecordingOverlayPanel: OverlayPanelManaging {
    private(set) var surfaces: [OverlaySurface] = []
    private(set) var showCount = 0
    private(set) var hideCount = 0

    init(surface: OverlaySurface) { surfaces = [surface] }
    func update(_ surface: OverlaySurface) { surfaces.append(surface) }
    func show() { showCount += 1 }
    func hide() { hideCount += 1 }
}

@MainActor
private final class RecordingOverlayPanelFactory {
    private(set) var createdPanels: [RecordingOverlayPanel] = []

    func make(surface: OverlaySurface) -> any OverlayPanelManaging {
        let panel = RecordingOverlayPanel(surface: surface)
        createdPanels.append(panel)
        return panel
    }
}
```

- [ ] **Step 2: Run the RED checks**

Run:

```bash
cd companion-macos
xcrun swift test --filter OverlayCoordinatorTests
```

Expected on full Xcode: compile failure because the coordinator still accepts `[OverlayLabel]` and creates multiple panels.

- [ ] **Step 3: Implement one transparent canvas view**

```swift
final class OverlayCanvasView: NSView {
    private var surface: OverlaySurface

    init(surface: OverlaySurface) {
        self.surface = surface
        super.init(frame: CGRect(origin: .zero, size: surface.frame.size))
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
    }

    required init?(coder: NSCoder) { nil }

    func update(_ surface: OverlaySurface) {
        self.surface = surface
        frame = CGRect(origin: .zero, size: surface.frame.size)
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        for patch in surface.patches where patch.frame.intersects(dirtyRect) {
            let background: NSColor = surface.appearance == .dark
                ? NSColor(calibratedWhite: 0.12, alpha: 1)
                : NSColor(calibratedWhite: 0.98, alpha: 1)
            let foreground: NSColor
            if patch.isEnabled {
                foreground = surface.appearance == .dark
                    ? NSColor(calibratedWhite: 0.90, alpha: 1)
                    : NSColor(calibratedWhite: 0.16, alpha: 1)
            } else {
                foreground = NSColor.secondaryLabelColor
            }
            background.setFill()
            patch.frame.fill()
            (patch.text as NSString).draw(
                in: patch.frame,
                withAttributes: [
                    .font: NSFont.systemFont(ofSize: 13, weight: .medium),
                    .foregroundColor: foreground,
                    .paragraphStyle: {
                        let style = NSMutableParagraphStyle()
                        style.alignment = .left
                        style.lineBreakMode = .byClipping
                        return style
                    }()
                ]
            )
        }
    }
}
```

Use left alignment, 13-point system font, medium weight, no corner radius, no shadow, and no pill background.

- [ ] **Step 4: Implement one retained panel**

```swift
@MainActor
protocol OverlayPanelManaging: AnyObject {
    func update(_ surface: OverlaySurface)
    func show()
    func hide()
}

@MainActor
public final class OverlayCoordinator: OverlayRendering {
    private var panels: [CGWindowID: any OverlayPanelManaging] = [:]
    private let panelFactory: (OverlaySurface) -> any OverlayPanelManaging

    init(panelFactory: @escaping (OverlaySurface) -> any OverlayPanelManaging = { OverlayPanel(surface: $0) }) {
        self.panelFactory = panelFactory
    }

    public func render(_ surface: OverlaySurface) {
        for (windowID, panel) in panels where windowID != surface.windowID {
            panel.hide()
        }
        if let panel = panels[surface.windowID] {
            panel.update(surface)
            panel.show()
        } else {
            let created = panelFactory(surface)
            created.show()
            panels[surface.windowID] = created
        }
    }

    public func clear() {
        panels.values.forEach { $0.hide() }
        panels.removeAll()
    }
}
```

Implement the concrete panel with one canvas and no activating or decorative window behavior:

```swift
final class OverlayPanel: NSPanel, OverlayPanelManaging {
    private let canvas: OverlayCanvasView

    init(surface: OverlaySurface) {
        canvas = OverlayCanvasView(surface: surface)
        super.init(
            contentRect: surface.frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        ignoresMouseEvents = true
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = canvas
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    func update(_ surface: OverlaySurface) {
        setFrame(surface.frame, display: false)
        canvas.update(surface)
    }

    func show() { orderFrontRegardless() }
    func hide() { orderOut(nil) }
}
```

- [ ] **Step 5: Verify GREEN and inspect WindowServer state**

Run:

```bash
cd companion-macos
swift build -c release
Tests/run-smoke-tests.zsh
```

Expected: the core smoke check exits 0; the release build proves the AppKit renderer compiles; on full Xcode, the coordinator test proves repeated renders create one panel and the panel remains non-activating and click-through.

- [ ] **Step 6: Commit the renderer replacement**

```bash
git add companion-macos/Sources/ClaudeChineseCompanion/OverlayCanvasView.swift \
  companion-macos/Sources/ClaudeChineseCompanion/OverlayPanel.swift \
  companion-macos/Sources/ClaudeChineseCompanion/OverlayCoordinator.swift \
  companion-macos/Sources/ClaudeChineseCompanion/ClaudeAccessibilityMonitor.swift \
  companion-macos/Tests/CompanionCoreTests/OverlayCoordinatorTests.swift
git commit -m "feat: render Chinese in one overlay surface"
```

---

### Task 4: Feed safe Accessibility controls into the overlay surface

**Files:**
- Modify: `companion-macos/Sources/ClaudeChineseCompanion/ClaudeAccessibilityMonitor.swift`
- Modify: `companion-macos/Sources/CompanionCore/TranslationDictionary.swift`
- Modify: `companion-macos/Tests/CompanionCoreTests/ClaudeAccessibilityMonitorTests.swift`
- Modify: `companion-macos/Tests/CompanionCoreTests/TranslationDictionaryTests.swift`
- Modify: `companion-macos/Tests/CompanionCoreTests/fixture.json`
- Modify: `companion-macos/Tests/main.swift`

**Interfaces:**
- Consumes: `AXUIElement` tree from the official Claude PID.
- Produces: one `OverlaySurface` containing only allowlisted, zone-safe static controls.
- Calls: `OverlayRendering.render(_ surface: OverlaySurface)` only when Claude is frontmost and a safe nonempty surface exists.
- Produces: `AccessibilitySnapshot(windowID:windowFrame:display:appearance:elements:)` and injectable `snapshotResolver`, `frontmostBundleIdentifier`, and `permissionState` closures.

Use this exact snapshot boundary and initializer contract:

```swift
public struct AccessibilitySnapshot: Equatable, Sendable {
    public let windowID: CGWindowID
    public let windowFrame: CGRect
    public let display: DisplayGeometry
    public let appearance: OverlayAppearance
    public let elements: [AccessibilityElement]

    public init(
        windowID: CGWindowID,
        windowFrame: CGRect,
        display: DisplayGeometry,
        appearance: OverlayAppearance,
        elements: [AccessibilityElement]
    ) {
        self.windowID = windowID
        self.windowFrame = windowFrame
        self.display = display
        self.appearance = appearance
        self.elements = elements
    }
}

public init(
    bundleIdentifier: String = ClaudeAccessibilityMonitor.officialBundleIdentifier,
    dictionary: TranslationDictionary,
    coordinator: OverlayRendering,
    snapshotResolver: (() -> AccessibilitySnapshot?)? = nil,
    frontmostBundleIdentifier: @escaping () -> String? = {
        NSWorkspace.shared.frontmostApplication?.bundleIdentifier
    },
    permissionState: @escaping () -> PermissionState = PermissionState.accessibility
)
```

The default `snapshotResolver` is the only path that touches `AXUIElement`; tests inject already-materialized snapshots containing synthetic strings.
The initializer stores the injected closures and assigns `self.snapshotResolver = snapshotResolver ?? { Self.resolveSnapshot(bundleIdentifier: bundleIdentifier) }`; `resolveSnapshot` immediately returns `nil` unless the bundle identifier is the official Claude identifier.

- [ ] **Step 1: Write failing synthetic-tree tests**

```swift
func testRefreshRendersKnownSidebarControlsAndRejectsConversationContent() {
    let window = CGRect(x: 0, y: 0, width: 1_200, height: 900)
    let snapshot = AccessibilitySnapshot(
        windowID: 42,
        windowFrame: window,
        display: DisplayGeometry(
            accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
            appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
        ),
        appearance: .light,
        elements: [
            AccessibilityElement(
                role: "AXButton", title: "Projects", value: nil,
                identifier: "sidebar-projects", isEnabled: true,
                parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                frame: CGRect(x: 20, y: 200, width: 200, height: 28)
            ),
            AccessibilityElement(
                role: "AXButton", title: "New", value: nil,
                identifier: "sidebar-new", isEnabled: true,
                parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
                frame: CGRect(x: 20, y: 240, width: 200, height: 28)
            ),
            AccessibilityElement(
                role: "AXTextArea", title: nil, value: "private prompt",
                identifier: "prompt", isEnabled: true,
                parentRole: "AXGroup", ancestorRoles: ["AXWindow", "AXWebArea"],
                frame: CGRect(x: 360, y: 760, width: 700, height: 90)
            ),
            AccessibilityElement(
                role: "AXButton", title: "Projects", value: nil,
                identifier: nil, isEnabled: true,
                parentRole: "AXList", ancestorRoles: ["AXWindow", "AXWebArea", "AXList"],
                frame: CGRect(x: 20, y: 400, width: 200, height: 28)
            )
        ]
    )
    let coordinator = RecordingCoordinator()
    let monitor = ClaudeAccessibilityMonitor(
        dictionary: fixtureDictionary,
        coordinator: coordinator,
        snapshotResolver: { snapshot },
        frontmostBundleIdentifier: { ClaudeAccessibilityMonitor.officialBundleIdentifier },
        permissionState: { .granted }
    )
    monitor.refresh()
    XCTAssertEqual(coordinator.surfaces.count, 1)
    XCTAssertEqual(coordinator.surfaces[0].patches.map(\.text), ["项目", "新建"])
}

@MainActor
private final class RecordingCoordinator: OverlayRendering {
    private(set) var surfaces: [OverlaySurface] = []
    private(set) var clearCount = 0

    func render(_ surface: OverlaySurface) { surfaces.append(surface) }
    func clear() { clearCount += 1 }
}
```

Extend `fixture.json` with exact `Projects → 项目` and `New → 新建` entries using the `AXButton` / `AXGroup` role pair so the test does not depend on production resources.

- [ ] **Step 2: Run the RED checks**

Run:

```bash
cd companion-macos
xcrun swift test --filter ClaudeAccessibilityMonitorTests
```

Expected on full Xcode: compile failure for missing `AccessibilitySnapshot`, `snapshotResolver`, and surface-based coordinator API.

- [ ] **Step 3: Traverse through `AXWebArea` without translating it**

Do not stop recursion merely because an ancestor is `AXWebArea`. Reject the current element if its role is editable/document/list content, but continue walking container children so allowlisted navigation buttons inside Electron web content can be discovered.

Read the role first. Read title/value/identifier/enabled only when `mayReadText` approves the current hierarchy, while still traversing children of containers such as `AXWebArea`:

```swift
private func walk(
    _ element: AXUIElement,
    ancestors: [String],
    windowFrame: CGRect,
    depth: Int,
    count: inout Int,
    into elements: inout [AccessibilityElement]
) {
    guard depth < 12, count < 800 else { return }
    count += 1
    let role = stringAttribute(kAXRoleAttribute, from: element) ?? ""
    let elementFrame = frame(of: element)
    if StaticInterfacePolicy.mayReadText(role: role, ancestorRoles: ancestors),
       let elementFrame,
       AccessibilityZonePolicy.permits(frame: elementFrame, in: windowFrame) {
        let candidate = AccessibilityElement(
            role: role,
            title: stringAttribute(kAXTitleAttribute, from: element),
            value: stringAttribute(kAXValueAttribute, from: element),
            identifier: stringAttribute(kAXIdentifierAttribute, from: element),
            isEnabled: boolAttribute(kAXEnabledAttribute, from: element),
            parentRole: ancestors.last,
            ancestorRoles: ancestors,
            frame: elementFrame
        )
        if StaticInterfacePolicy.allows(candidate, windowFrame: windowFrame) {
            elements.append(candidate)
        }
    }

    let nextAncestors = ancestors + [role]
    for child in childrenAttribute(kAXChildrenAttribute, from: element) {
        walk(
            child,
            ancestors: nextAncestors,
            windowFrame: windowFrame,
            depth: depth + 1,
            count: &count,
            into: &elements
        )
    }
}
```

Resolve the focused window number from the `"AXWindowNumber"` attribute and reject the snapshot when `kAXMinimizedAttribute` is true. Resolve its display by matching the top-left Accessibility window frame against `CGDisplayBounds(displayID)`, then pair that Quartz frame with the same display's `NSScreen.frame` using `NSScreenNumber`. Resolve appearance only when `NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua])` returns one of those two values. If the window number, display pair, window frame, minimized state, or light/dark appearance cannot be resolved unambiguously, return `nil` and clear the overlay.

`stringAttribute`, `boolAttribute`, `childrenAttribute`, and `frame(of:)` are private wrappers around `AXUIElementCopyAttributeValue`; they return `nil` or an empty array on any Accessibility error. The snapshot receives only candidates already accepted by the static-copy and region policy. The traversal contains no logging, file writes, telemetry, network calls, or debug descriptions of `title` or `value`; it may recurse through `AXWebArea`, but it does not read text from editable/document/list hierarchies or retain unknown/user-generated copy.

- [ ] **Step 4: Translate only after policy approval**

```swift
private func translations(for snapshot: AccessibilitySnapshot) -> [(AccessibilityElement, String)] {
    snapshot.elements.compactMap { candidate in
        guard StaticInterfacePolicy.allows(candidate, windowFrame: snapshot.windowFrame),
              let source = candidate.title ?? candidate.value,
              let chinese = dictionary.translation(forVisibleText: source) else {
            return nil
        }
        return (candidate, chinese)
    }
}
```

- [ ] **Step 5: Build one surface and render only for frontmost Claude**

```swift
guard frontmostBundleIdentifier() == Self.officialBundleIdentifier else {
    coordinator.clear()
    return
}
guard permissionState() == .granted,
      let snapshot = snapshotResolver() else {
    coordinator.clear()
    return
}
let translations = translations(for: snapshot)
guard let surface = OverlayLayout.surface(
    windowID: snapshot.windowID,
    windowFrame: snapshot.windowFrame,
    display: snapshot.display,
    appearance: snapshot.appearance,
    translations: translations
) else {
    coordinator.clear()
    return
}
coordinator.render(surface)
```

Keep the existing workspace and Accessibility observer coverage for launch, termination, activation, focused-window, move, resize, layout, title, value, menu, and selection changes. Continue merging bursts through the existing 0.1-second one-shot debounce. Do not add a repeating traversal or OCR timer; when Claude is not frontmost, every refresh exits through `coordinator.clear()` before resolving a snapshot.

- [ ] **Step 6: Verify GREEN and event-driven refresh**

Run:

```bash
cd companion-macos
swift build -c release
Tests/run-smoke-tests.zsh
```

Expected: release build and the pure-core smoke executable succeed; synthetic tests pass on full Xcode; no `Vision`, `CGWindowListCreateImage`, or OCR timer is referenced by the active monitor.

- [ ] **Step 7: Commit the Accessibility pipeline**

```bash
git add companion-macos/Sources/ClaudeChineseCompanion/ClaudeAccessibilityMonitor.swift \
  companion-macos/Sources/CompanionCore/TranslationDictionary.swift \
  companion-macos/Tests/CompanionCoreTests/ClaudeAccessibilityMonitorTests.swift \
  companion-macos/Tests/CompanionCoreTests/TranslationDictionaryTests.swift \
  companion-macos/Tests/CompanionCoreTests/fixture.json \
  companion-macos/Tests/main.swift
git commit -m "feat: drive Chinese overlay from accessibility"
```

---

### Task 5: Switch permissions and retire runtime OCR

**Files:**
- Modify: `companion-macos/Sources/ClaudeChineseCompanion/CompanionApp.swift`
- Modify: `companion-macos/Sources/ClaudeChineseCompanion/PermissionState.swift`
- Create: `companion-macos/Sources/ClaudeChineseCompanion/TranslationActivationController.swift`
- Delete: `companion-macos/Sources/ClaudeChineseCompanion/ScreenCapturePermission.swift`
- Delete: `companion-macos/Sources/ClaudeChineseCompanion/ScreenOCRMonitor.swift`
- Delete: `companion-macos/Sources/CompanionCore/OCRCoordinateMapper.swift`
- Delete: `companion-macos/Sources/CompanionCore/OCRZonePolicy.swift`
- Create: `companion-macos/Tests/CompanionCoreTests/TranslationActivationControllerTests.swift`
- Modify: `companion-macos/Tests/main.swift`
- Modify: `src/companion.mjs`
- Modify: `test/companion.test.mjs`
- Modify: `test/cli.test.mjs`

**Interfaces:**
- Consumes: `PermissionState.accessibility()` and `PermissionState.requestAccessibilityPrompt()`.
- Produces: a menu toggle backed only by `ClaudeAccessibilityMonitor`.
- Produces: `TranslationActivationController.enable() -> Bool` and `disable()` with injectable permission, prompt, guidance, and Claude-activation closures.
- Packaging: omits `NSScreenCaptureUsageDescription` and keeps the stable designated requirement.

- [ ] **Step 1: Write failing permission and packaging tests**

```js
assert.doesNotMatch(infoPlist, /NSScreenCaptureUsageDescription/);
assert.match(infoPlist, /NSAccessibilityUsageDescription/);
assert.deepEqual(codesignArgs.slice(-3), [
  '--requirements',
  '=designated => identifier "com.kiletry.claude-chinese-companion"',
  companionAppPath(outputDir),
]);
```

Add this Swift test so missing Accessibility permission calls the prompt seam and never starts the monitor:

```swift
@MainActor
func testMissingAccessibilityPermissionPromptsWithoutStartingMonitor() {
    let monitor = RecordingTranslationMonitor()
    var promptCount = 0
    var guidanceCount = 0
    let controller = TranslationActivationController(
        monitor: monitor,
        permissionState: { .missing },
        requestPrompt: { promptCount += 1 },
        showGuidance: { guidanceCount += 1 },
        activateClaude: {}
    )

    XCTAssertFalse(controller.enable())
    XCTAssertEqual(promptCount, 1)
    XCTAssertEqual(guidanceCount, 1)
    XCTAssertEqual(monitor.startCount, 0)
}

@MainActor
private final class RecordingTranslationMonitor: TranslationMonitoring {
    private(set) var startCount = 0
    private(set) var stopCount = 0
    func start() { startCount += 1 }
    func stop() { stopCount += 1 }
}
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test test/companion.test.mjs test/cli.test.mjs
```

Expected: failure because the Info.plist still declares Screen Recording and lacks the Accessibility description.

- [ ] **Step 3: Replace the app toggle flow**

```swift
@MainActor
protocol TranslationMonitoring: AnyObject {
    func start()
    func stop()
}

extension ClaudeAccessibilityMonitor: TranslationMonitoring {}

@MainActor
final class TranslationActivationController {
    private let monitor: TranslationMonitoring
    private let permissionState: () -> PermissionState
    private let requestPrompt: () -> Void
    private let showGuidance: () -> Void
    private let activateClaude: () -> Void

    init(
        monitor: TranslationMonitoring,
        permissionState: @escaping () -> PermissionState = PermissionState.accessibility,
        requestPrompt: @escaping () -> Void = PermissionState.requestAccessibilityPrompt,
        showGuidance: @escaping () -> Void,
        activateClaude: @escaping () -> Void
    ) {
        self.monitor = monitor
        self.permissionState = permissionState
        self.requestPrompt = requestPrompt
        self.showGuidance = showGuidance
        self.activateClaude = activateClaude
    }

    func enable() -> Bool {
        guard permissionState() == .granted else {
            requestPrompt()
            showGuidance()
            return false
        }
        monitor.start()
        activateClaude()
        return true
    }

    func disable() {
        monitor.stop()
    }
}
```

`CompanionAppDelegate` owns this controller. It sets the menu state to `.on` only when `enable()` returns `true`, calls `disable()` when toggled off, and uses guidance text naming `系统设置 → 隐私与安全性 → 辅助功能` and `Claude 中文伴侣`.

- [ ] **Step 4: Remove OCR runtime sources and package metadata**

Delete the four OCR source files listed above. Remove Vision and Screen Recording wording from the application window, menu, README instructions, and generated Info.plist. Keep the downloaded translation dictionary because Accessibility uses the same English-to-Chinese data.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test
cd companion-macos && swift build -c release
Tests/run-smoke-tests.zsh
cd ..
if rg -n 'import Vision|CGWindowListCreateImage|CGPreflightScreenCaptureAccess|CGRequestScreenCaptureAccess' \
  companion-macos/Sources src; then
  echo 'Active OCR or screen-capture runtime reference remains.' >&2
  exit 1
fi
npm run package
```

Expected: all Node tests pass; Swift release build passes; package dry run exits 0; source search finds no active Vision or screen-capture calls.

- [ ] **Step 6: Commit permission migration**

```bash
git add -A companion-macos/Sources companion-macos/Tests src/companion.mjs test README.md
git commit -m "refactor: replace OCR with accessibility overlay"
```

---

### Task 6: Install and perform full macOS acceptance

**Files:**
- Modify: `README.md`
- Modify: `NOTICE`
- Modify: `scripts/verify-companion-window.zsh`
- Create: `scripts/verify-single-overlay.zsh`

**Interfaces:**
- Build command: `./install.sh build-companion`.
- Installed bundle: `/Applications/Claude Chinese Companion.app`.
- Verification output: official Claude integrity, companion signature rule, exactly one visible overlay panel, and no central-region patches.

- [ ] **Step 1: Add the failing one-panel verifier**

The verifier must query WindowServer after enabling the companion and fail unless exactly one on-screen layer-3 window belongs to `Claude 中文伴侣` while Claude is frontmost.

```zsh
#!/bin/zsh
set -euo pipefail

app_path=${1:?Usage: verify-single-overlay.zsh '/Applications/Claude Chinese Companion.app'}
executable="$app_path/Contents/MacOS/ClaudeChineseCompanion"
companion_pid=$(/usr/bin/pgrep -f -x "$executable" | /usr/bin/head -n 1 || true)
[[ -n "$companion_pid" ]] || {
  print -u2 "Claude Chinese Companion is not running."
  exit 2
}

frontmost_bundle=$(/usr/bin/swift -e '
  import AppKit
  print(NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "")
')
[[ "$frontmost_bundle" == "com.anthropic.claudefordesktop" ]] || {
  print -u2 "Official Claude must be frontmost before overlay verification."
  exit 3
}

panel_count=$(/usr/bin/swift -e '
  import Foundation
  import CoreGraphics

  let targetPID = Int(CommandLine.arguments[1])!
  let windows = CGWindowListCopyWindowInfo(
      [.optionOnScreenOnly, .excludeDesktopElements],
      kCGNullWindowID
  ) as? [[String: Any]] ?? []
  let count = windows.filter { info in
      let ownerPID = (info[kCGWindowOwnerPID as String] as? NSNumber)?.intValue
      let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue
      let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 0
      let bounds = info[kCGWindowBounds as String] as? [String: Any] ?? [:]
      let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0
      let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0
      return ownerPID == targetPID && layer == 3 && alpha > 0 && width > 0 && height > 0
  }.count
  print(count)
' "$companion_pid")
[[ "$panel_count" == "1" ]] || {
  print -u2 "Expected one visible overlay panel, found $panel_count"
  exit 1
}
print "Verified one visible click-through overlay panel for companion pid $companion_pid."
```

Run `chmod +x scripts/verify-single-overlay.zsh` after creating the verifier.

- [ ] **Step 2: Update user documentation**

Document the Accessibility permission, one-surface architecture, privacy exclusions, stable local signature, rebuild-after-Claude-update flow, and explicit thanks to `ICERainbow666/claude-desktop-zh-cn`.

- [ ] **Step 3: Run the complete automated gate**

Run:

```bash
npm test
npm run package
cd companion-macos
swift build -c release
Tests/run-smoke-tests.zsh
cd ..
if rg -n 'import Vision|CGWindowListCreateImage|CGPreflightScreenCaptureAccess|CGRequestScreenCaptureAccess' \
  companion-macos/Sources src; then
  echo 'Active OCR or screen-capture runtime reference remains.' >&2
  exit 1
fi
git diff --check
```

Expected: every command exits 0. Separately record that `swift test` requires full Xcode because the current Command Line Tools installation lacks XCTest.

- [ ] **Step 4: Build and replace only the companion bundle**

Run:

```bash
./install.sh build-companion
pkill -f '^/Applications/Claude Chinese Companion.app/Contents/MacOS/ClaudeChineseCompanion$' || true
backup_path="/Applications/Claude Chinese Companion (pre-accessibility-overlay $(date +%Y%m%d-%H%M%S)).app"
if [[ -d '/Applications/Claude Chinese Companion.app' ]]; then
  mv '/Applications/Claude Chinese Companion.app' "$backup_path"
fi
/usr/bin/ditto 'dist/Claude Chinese Companion.app' \
  '/Applications/Claude Chinese Companion.app'
/usr/bin/codesign --verify --deep --strict \
  '/Applications/Claude Chinese Companion.app'
/usr/bin/open -n '/Applications/Claude Chinese Companion.app'
```

Do not execute any write command against `/Applications/Claude.app`.

- [ ] **Step 5: User grants Accessibility and relaunches once**

The user enables `Claude 中文伴侣` under `系统设置 → 隐私与安全性 → 辅助功能`, quits the companion, and opens it again. This user action cannot be automated or bypassed.

- [ ] **Step 6: Verify the real interface requirement-by-requirement**

Run signature checks:

```bash
/usr/bin/codesign --verify --deep --strict /Applications/Claude.app
/usr/sbin/spctl --assess --type execute -vv /Applications/Claude.app
/usr/bin/codesign -dr - '/Applications/Claude Chinese Companion.app'
scripts/verify-single-overlay.zsh '/Applications/Claude Chinese Companion.app'
```

Then manually confirm:

- Home, Code, New, Projects, Artifacts, Customize, View all, and Import memory display Chinese.
- No patch is clipped, displaced, overlapping, or pill-shaped.
- Claude controls remain clickable through the overlay.
- Moving, resizing, page switching, theme switching, and full screen remain aligned.
- Chats, prompts, attachments, conversation titles, and user information remain unchanged.
- Disabling translation removes the single overlay immediately.

- [ ] **Step 7: Commit final acceptance assets**

```bash
git add README.md NOTICE scripts/verify-companion-window.zsh scripts/verify-single-overlay.zsh
git commit -m "docs: document accessibility companion acceptance"
```

## Plan Self-Review

- Spec coverage: Tasks 1 and 4 enforce pre-read content exclusions, static-copy, region, frontmost/minimized, event/debounce, and privacy boundaries; Tasks 2 and 3 implement measured, multi-display, native-looking one-surface rendering; Task 5 replaces OCR and Screen Recording; Task 6 covers permissions, installation, official-app integrity, performance direction, and real UI acceptance.
- Placeholder scan: every task names exact files, interfaces, test commands, implementation behavior, and commits; no deferred implementation markers remain.
- Type consistency: `AccessibilityElement` feeds `StaticInterfacePolicy`; accepted controls become `OverlayPatch`; patches form one `OverlaySurface`; `OverlayRendering.render(_ surface: OverlaySurface)` is used consistently by the monitor and coordinator.
- Scope: the plan changes only the standalone companion and its build/docs; the official Claude bundle remains read-only.
