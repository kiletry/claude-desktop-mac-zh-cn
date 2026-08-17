import CoreGraphics

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
        let accessibility = display.accessibilityFrame
        let appKit = display.appKitFrame
        guard !frame.isEmpty, !accessibility.isEmpty, !appKit.isEmpty else { return .null }

        let scaleX = appKit.width / accessibility.width
        let scaleY = appKit.height / accessibility.height
        return CGRect(
            x: appKit.minX + (frame.minX - accessibility.minX) * scaleX,
            y: appKit.maxY - (frame.maxY - accessibility.minY) * scaleY,
            width: frame.width * scaleX,
            height: frame.height * scaleY
        )
    }
}
