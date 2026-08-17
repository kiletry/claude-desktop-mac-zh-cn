import CoreGraphics

public enum OverlayAppearance: Equatable, Sendable {
    case light
    case dark
}

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
