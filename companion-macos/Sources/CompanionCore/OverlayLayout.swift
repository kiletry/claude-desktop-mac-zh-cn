import CoreGraphics

public struct OverlayLabel: Equatable, Sendable {
    public let text: String
    public let frame: CGRect

    public init(text: String, frame: CGRect) {
        self.text = text
        self.frame = frame
    }
}

public enum OverlayLayout {
    private static let horizontalPadding: CGFloat = 12
    private static let verticalPadding: CGFloat = 6
    private static let characterWidth: CGFloat = 16
    private static let lineHeight: CGFloat = 20
    private static let gap: CGFloat = 6

    public static func labels(
        for translations: [(AccessibilityElement, String)],
        screenFrame: CGRect
    ) -> [OverlayLabel] {
        translations.compactMap { element, text in
            guard !text.isEmpty,
                  !screenFrame.isNull,
                  !screenFrame.isEmpty,
                  !element.frame.isNull,
                  !element.frame.isEmpty,
                  element.frame.intersects(screenFrame) else {
                return nil
            }

            let preferredSize = CGSize(
                width: max(characterWidth, CGFloat(text.count) * characterWidth) + horizontalPadding * 2,
                height: lineHeight + verticalPadding * 2
            )
            let size = CGSize(
                width: min(preferredSize.width, screenFrame.width),
                height: min(preferredSize.height, screenFrame.height)
            )
            let preferredAbove = CGRect(
                x: element.frame.midX - size.width / 2,
                y: element.frame.maxY + gap,
                width: size.width,
                height: size.height
            )
            let preferredFrame = preferredAbove.maxY <= screenFrame.maxY
                ? preferredAbove
                : CGRect(
                    x: preferredAbove.minX,
                    y: element.frame.minY - gap - size.height,
                    width: size.width,
                    height: size.height
                )

            return OverlayLabel(text: text, frame: clamped(preferredFrame, to: screenFrame))
        }
    }

    private static func clamped(_ frame: CGRect, to bounds: CGRect) -> CGRect {
        CGRect(
            x: min(max(frame.minX, bounds.minX), bounds.maxX - frame.width),
            y: min(max(frame.minY, bounds.minY), bounds.maxY - frame.height),
            width: frame.width,
            height: frame.height
        )
    }
}
