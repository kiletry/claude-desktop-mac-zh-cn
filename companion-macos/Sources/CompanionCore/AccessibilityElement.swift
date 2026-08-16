import CoreGraphics

public struct AccessibilityElement: Equatable, Sendable {
    public let role: String
    public let title: String?
    public let value: String?
    public let identifier: String?
    public let isEnabled: Bool?
    public let parentRole: String?
    public let ancestorRoles: [String]
    public let frame: CGRect

    public init(
        role: String,
        title: String?,
        value: String?,
        identifier: String?,
        isEnabled: Bool?,
        parentRole: String?,
        ancestorRoles: [String],
        frame: CGRect
    ) {
        self.role = role
        self.title = title
        self.value = value
        self.identifier = identifier
        self.isEnabled = isEnabled
        self.parentRole = parentRole
        self.ancestorRoles = ancestorRoles
        self.frame = frame
    }

    public init(role: String, title: String?, value: String?, parentRole: String?, frame: CGRect) {
        self.init(
            role: role,
            title: title,
            value: value,
            identifier: nil,
            isEnabled: nil,
            parentRole: parentRole,
            ancestorRoles: [],
            frame: frame
        )
    }
}
