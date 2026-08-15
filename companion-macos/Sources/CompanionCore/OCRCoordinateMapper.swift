import CoreGraphics

public enum OCRCoordinateMapper {
    public static func screenFrame(observation: CGRect, in window: CGRect, screen: CGRect) -> CGRect {
        let windowFrame = CGRect(
            x: window.minX + observation.minX * window.width,
            y: window.minY + (1 - observation.maxY) * window.height,
            width: observation.width * window.width,
            height: observation.height * window.height
        )
        return CGRect(
            x: windowFrame.minX,
            y: screen.maxY - windowFrame.maxY,
            width: windowFrame.width,
            height: windowFrame.height
        )
    }
}
