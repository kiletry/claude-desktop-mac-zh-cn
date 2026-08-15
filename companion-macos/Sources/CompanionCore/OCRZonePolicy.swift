import CoreGraphics

public enum OCRZonePolicy {
    private static let sidebarFraction: CGFloat = 0.30
    private static let toolbarFraction: CGFloat = 0.14

    public static func permits(frame: CGRect, in windowFrame: CGRect) -> Bool {
        guard !frame.isNull, !frame.isEmpty,
              !windowFrame.isNull, !windowFrame.isEmpty,
              frame.intersects(windowFrame) else {
            return false
        }
        let relativeX = (frame.midX - windowFrame.minX) / windowFrame.width
        let relativeTop = (windowFrame.maxY - frame.midY) / windowFrame.height
        return relativeX <= sidebarFraction || relativeTop <= toolbarFraction
    }
}
