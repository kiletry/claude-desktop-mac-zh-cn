import CoreGraphics

public struct AccessibilityElement: Equatable, Sendable {
    public let role: String
    public let title: String?
    public let value: String?
    public let parentRole: String?
    public let frame: CGRect

    public init(role: String, title: String?, value: String?, parentRole: String?, frame: CGRect) {
        self.role = role
        self.title = title
        self.value = value
        self.parentRole = parentRole
        self.frame = frame
    }
}
