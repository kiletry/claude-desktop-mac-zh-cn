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
    private static let stableIdentifiers: Set<String> = [
        "sidebar-home", "sidebar-code", "sidebar-new", "sidebar-projects",
        "sidebar-artifacts", "sidebar-customize", "sidebar-chats-and-tasks",
        "sidebar-view-all", "sidebar-filter-group-recents", "sidebar-import-memory",
        "toolbar-search", "toolbar-collapse-sidebar", "toolbar-search-projects",
        "toolbar-sort-projects", "toolbar-new-project", "toolbar-settings",
        "toolbar-back", "toolbar-forward", "toolbar-help"
    ]

    public static func mayReadText(role: String, ancestorRoles: [String]) -> Bool {
        !rejectedRoles.contains(role) && !ancestorRoles.contains(where: rejectedRoles.contains)
    }

    public static func allows(_ element: AccessibilityElement, windowFrame: CGRect) -> Bool {
        guard allowedRoles.contains(element.role),
              mayReadText(role: element.role, ancestorRoles: element.ancestorRoles),
              let identifier = element.identifier,
              stableIdentifiers.contains(identifier),
              element.isEnabled == true,
              let parentRole = element.parentRole,
              ((identifier.hasPrefix("sidebar-") && parentRole == "AXGroup") ||
               (identifier.hasPrefix("toolbar-") && parentRole == "AXToolbar")),
              element.ancestorRoles.contains("AXWindow"),
              AccessibilityZonePolicy.permits(frame: element.frame, in: windowFrame) else {
            return false
        }
        return [element.title, element.value]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .contains(where: allowedCopy.contains)
    }
}
