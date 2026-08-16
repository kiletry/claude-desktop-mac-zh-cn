import Foundation

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
