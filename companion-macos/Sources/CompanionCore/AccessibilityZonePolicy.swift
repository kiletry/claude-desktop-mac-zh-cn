import CoreGraphics

public enum AccessibilityZonePolicy {
    public static func permits(frame: CGRect, in windowFrame: CGRect) -> Bool {
        guard !frame.isEmpty, frame.intersects(windowFrame), !windowFrame.isEmpty else { return false }
        let relativeX = (frame.midX - windowFrame.minX) / windowFrame.width
        let relativeTop = (frame.midY - windowFrame.minY) / windowFrame.height
        return relativeX <= 0.30 || relativeTop <= 0.14
    }
}
