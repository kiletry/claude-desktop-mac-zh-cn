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
