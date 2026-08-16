import CompanionCore
import CoreGraphics

let window = CGRect(x: 100, y: 200, width: 1_000, height: 700)
let screen = CGRect(x: 0, y: 0, width: 1_440, height: 900)

precondition(OCRZonePolicy.permits(
    frame: CGRect(x: 120, y: 420, width: 180, height: 24),
    in: window
))
precondition(OCRZonePolicy.permits(
    frame: CGRect(x: 560, y: 825, width: 180, height: 24),
    in: window
))
precondition(!OCRZonePolicy.permits(
    frame: CGRect(x: 500, y: 460, width: 240, height: 28),
    in: window
))

let mapped = OCRCoordinateMapper.screenFrame(
    observation: CGRect(x: 0.2, y: 0.6, width: 0.1, height: 0.05),
    in: window,
    screen: screen
)
precondition(mapped == CGRect(x: 300, y: 420, width: 100, height: 35))

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
precondition(OverlayLayout.patch(
    controlFrame: CGRect(x: 12, y: 20, width: 90, height: 28),
    text: "筛选并分组最近记录",
    isEnabled: true
) == nil)
