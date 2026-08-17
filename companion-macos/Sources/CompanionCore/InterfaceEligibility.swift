public enum InterfaceEligibility {
    private static let allowedRoles: Set<String> = [
        "AXMenuItem", "AXButton", "AXCheckBox", "AXRadioButton", "AXTab", "AXStaticText"
    ]
    private static let allowedParentRoles: Set<String> = [
        "AXMenu", "AXMenuBar", "AXToolbar", "AXDialog", "AXGroup", "AXSettings"
    ]
    private static let rejectedRoles: Set<String> = [
        "AXWebArea", "AXTextArea", "AXTextField", "AXSearchField", "AXList", "AXTable",
        "AXRow", "AXCell", "AXOutline", "AXScrollArea", "AXDocument"
    ]

    public static func allows(_ element: AccessibilityElement) -> Bool {
        guard !rejectedRoles.contains(element.role), allowedRoles.contains(element.role) else {
            return false
        }
        guard let parentRole = element.parentRole, allowedParentRoles.contains(parentRole) else {
            return false
        }
        guard element.title != nil || element.value != nil else {
            return false
        }
        return true
    }
}
