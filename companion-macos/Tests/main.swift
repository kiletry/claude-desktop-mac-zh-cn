import CompanionCore
import CoreGraphics
import Foundation

let staticWindow = CGRect(x: 0, y: 0, width: 1_200, height: 900)
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
precondition(StaticInterfacePolicy.allows(projects, windowFrame: staticWindow))

let safeTitlePrivateValue = AccessibilityElement(
    role: "AXButton",
    title: "Projects",
    value: "private prompt",
    identifier: "sidebar-projects",
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
    frame: CGRect(x: 20, y: 240, width: 180, height: 28)
)
precondition(
    StaticInterfacePolicy.approvedSource(for: safeTitlePrivateValue, windowFrame: staticWindow)
        == .title("Projects")
)

let privateTitleSafeValue = AccessibilityElement(
    role: "AXButton",
    title: "private prompt",
    value: "New",
    identifier: "sidebar-new",
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
    frame: CGRect(x: 20, y: 280, width: 180, height: 28)
)
precondition(
    StaticInterfacePolicy.approvedSource(for: privateTitleSafeValue, windowFrame: staticWindow)
        == .value("New")
)

let ambiguousStaticCopy = AccessibilityElement(
    role: "AXButton",
    title: "Projects",
    value: "New",
    identifier: "sidebar-projects",
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
    frame: CGRect(x: 20, y: 320, width: 180, height: 28)
)
precondition(StaticInterfacePolicy.approvedSource(for: ambiguousStaticCopy, windowFrame: staticWindow) == nil)
precondition(!StaticInterfacePolicy.allows(ambiguousStaticCopy, windowFrame: staticWindow))

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
precondition(!StaticInterfacePolicy.allows(conversationTitle, windowFrame: staticWindow))

let userTitle = AccessibilityElement(
    role: "AXButton",
    title: "A private user conversation",
    value: nil,
    identifier: nil,
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXGroup"],
    frame: CGRect(x: 20, y: 300, width: 180, height: 28)
)
precondition(!StaticInterfacePolicy.allows(userTitle, windowFrame: staticWindow))

let collidingConversationTitle = AccessibilityElement(
    role: "AXButton",
    title: "Projects",
    value: nil,
    identifier: "conversation-title",
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXWebArea", "AXGroup"],
    frame: CGRect(x: 20, y: 300, width: 180, height: 28)
)
precondition(!StaticInterfacePolicy.allows(collidingConversationTitle, windowFrame: staticWindow))

let incomplete = AccessibilityElement(
    role: "AXButton",
    title: "Settings",
    value: nil,
    parentRole: "AXToolbar",
    frame: CGRect(x: 500, y: 100, width: 120, height: 30)
)
precondition(!StaticInterfacePolicy.allows(incomplete, windowFrame: staticWindow))

precondition(StaticInterfacePolicy.mayReadText(role: "AXButton", ancestorRoles: ["AXWindow", "AXGroup"]))
precondition(!StaticInterfacePolicy.mayReadText(role: "AXTextArea", ancestorRoles: ["AXWindow", "AXGroup"]))
precondition(!StaticInterfacePolicy.mayReadText(role: "AXButton", ancestorRoles: ["AXWindow", "AXList"]))
precondition(AccessibilityZonePolicy.permits(
    frame: CGRect(x: 300, y: 800, width: 40, height: 20),
    in: staticWindow
))
precondition(AccessibilityZonePolicy.permits(
    frame: CGRect(x: 500, y: 100, width: 120, height: 30),
    in: staticWindow
))
precondition(!AccessibilityZonePolicy.permits(
    frame: CGRect(x: 500, y: 400, width: 180, height: 28),
    in: staticWindow
))
precondition(!AccessibilityZonePolicy.permits(frame: .zero, in: staticWindow))

let primaryDisplay = DisplayGeometry(
    accessibilityFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080),
    appKitFrame: CGRect(x: 0, y: 0, width: 1_920, height: 1_080)
)
precondition(AccessibilityCoordinateMapper.appKitFrame(
    CGRect(x: 20, y: 100, width: 180, height: 28),
    on: primaryDisplay
) == CGRect(x: 20, y: 952, width: 180, height: 28))

let scaledDisplay = DisplayGeometry(
    accessibilityFrame: CGRect(x: 1_920, y: 0, width: 1_280, height: 720),
    appKitFrame: CGRect(x: 1_920, y: 0, width: 2_560, height: 1_440)
)
precondition(AccessibilityCoordinateMapper.appKitFrame(
    CGRect(x: 2_020, y: 50, width: 200, height: 40),
    on: scaledDisplay
) == CGRect(x: 2_120, y: 1_260, width: 400, height: 80))

let chinesePatch = OverlayLayout.patch(
    controlFrame: CGRect(x: 12, y: 20, width: 210, height: 28),
    text: "项目",
    isEnabled: true
)
precondition(chinesePatch?.frame.minX == 44)
precondition(chinesePatch?.frame.maxX ?? .infinity <= 214)
precondition(chinesePatch?.frame.height ?? 0 > 0)
precondition(OverlayLayout.patch(
    controlFrame: CGRect(x: 12, y: 20, width: 90, height: 28),
    text: "筛选并分组最近记录",
    isEnabled: true
) == nil)
precondition(OverlayLayout.patch(
    controlFrame: CGRect(x: 12, y: 20, width: 210, height: 16),
    text: "项目",
    isEnabled: true
) == nil)
precondition(OverlayLayout.patch(
    controlFrame: CGRect(x: 12, y: 20, width: 210, height: -28),
    text: "项目",
    isEnabled: true
) == nil)

let surfaceControl = AccessibilityElement(
    role: "AXButton",
    title: "Projects",
    value: nil,
    identifier: "sidebar-projects",
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXGroup"],
    frame: CGRect(x: 120, y: 230, width: 210, height: 28)
)
let overlaySurface = OverlayLayout.surface(
    windowID: 42,
    windowFrame: CGRect(x: 100, y: 200, width: 400, height: 300),
    display: primaryDisplay,
    appearance: .dark,
    translations: [(surfaceControl, "项目")]
)
precondition(overlaySurface?.patches.first?.frame == CGRect(x: 52, y: 244, width: 170, height: 24))

let outsideSurfaceControl = AccessibilityElement(
    role: "AXButton",
    title: "Projects",
    value: nil,
    identifier: "sidebar-projects",
    isEnabled: true,
    parentRole: "AXGroup",
    ancestorRoles: ["AXWindow", "AXGroup"],
    frame: CGRect(x: 20, y: 230, width: 210, height: 28)
)
precondition(OverlayLayout.surface(
    windowID: 42,
    windowFrame: CGRect(x: 100, y: 200, width: 400, height: 300),
    display: primaryDisplay,
    appearance: .dark,
    translations: [(outsideSurfaceControl, "项目")]
) == nil)
precondition(OverlayLayout.surface(
    windowID: 42,
    windowFrame: CGRect(x: 100, y: 200, width: 400, height: 300),
    display: primaryDisplay,
    appearance: .dark,
    translations: []
) == nil)

let fixtureEntries = """
[
  {"source":"Projects","role":"AXButton","parentRole":"AXGroup","target":"项目"},
  {"source":"New","role":"AXButton","parentRole":"AXGroup","target":"新建"}
]
""".data(using: .utf8)!
let fixtureURL = FileManager.default.temporaryDirectory
    .appendingPathComponent("claude-accessibility-task-4-fixture-\(UUID().uuidString).json")
try fixtureEntries.write(to: fixtureURL)
defer { try? FileManager.default.removeItem(at: fixtureURL) }

let fixtureDictionary = try TranslationDictionary(resourceURL: fixtureURL)
precondition(fixtureDictionary.translation(forVisibleText: "Projects") == "项目")
precondition(fixtureDictionary.translation(forVisibleText: "New") == "新建")
precondition(fixtureDictionary.translation(forVisibleText: "private prompt") == nil)
