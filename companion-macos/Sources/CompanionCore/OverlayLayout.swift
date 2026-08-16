import CoreGraphics
import CoreText
import Foundation
import AppKit

// Retained while the current app target still renders legacy OCR labels.
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

    public static func patch(controlFrame: CGRect, text: String, isEnabled: Bool) -> OverlayPatch? {
        guard !text.isEmpty,
              controlFrame.size.width > 0,
              controlFrame.size.height > 0 else { return nil }
        let appKitFont = NSFont.systemFont(ofSize: 13, weight: .medium)
        let font = CTFontCreateWithName(appKitFont.fontName as CFString, appKitFont.pointSize, nil)

        let attributed = NSAttributedString(
            string: text,
            attributes: [kCTFontAttributeName as NSAttributedString.Key: font]
        )
        let line = CTLineCreateWithAttributedString(attributed)
        var ascent: CGFloat = 0
        var descent: CGFloat = 0
        var leading: CGFloat = 0
        let measuredWidth = ceil(CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, &leading))) + 4
        let measuredHeight = ceil(ascent + descent + leading)
        let textFrame = CGRect(
            x: controlFrame.minX + 32,
            y: controlFrame.minY + 2,
            width: controlFrame.width - 40,
            height: controlFrame.height - 4
        )

        guard textFrame.width >= 40,
              textFrame.height > 0,
              measuredWidth <= textFrame.width,
              measuredHeight <= textFrame.height,
              textFrame.minX >= controlFrame.minX,
              textFrame.maxX <= controlFrame.maxX - 8,
              textFrame.minY >= controlFrame.minY,
              textFrame.maxY <= controlFrame.maxY else { return nil }

        return OverlayPatch(text: text, frame: textFrame, isEnabled: isEnabled)
    }

    public static func surface(
        windowID: CGWindowID,
        windowFrame: CGRect,
        display: DisplayGeometry,
        appearance: OverlayAppearance,
        translations: [(AccessibilityElement, String)]
    ) -> OverlaySurface? {
        let appKitWindow = AccessibilityCoordinateMapper.appKitFrame(windowFrame, on: display)
        guard !appKitWindow.isNull, !appKitWindow.isEmpty else { return nil }

        let localBounds = CGRect(origin: .zero, size: appKitWindow.size)
        let patches = translations.compactMap { element, text -> OverlayPatch? in
            let appKitControl = AccessibilityCoordinateMapper.appKitFrame(element.frame, on: display)
            guard !appKitControl.isNull, !appKitControl.isEmpty else { return nil }

            let localControl = CGRect(
                x: appKitControl.minX - appKitWindow.minX,
                y: appKitControl.minY - appKitWindow.minY,
                width: appKitControl.width,
                height: appKitControl.height
            )
            guard localBounds.contains(localControl) else { return nil }
            return patch(controlFrame: localControl, text: text, isEnabled: element.isEnabled != false)
        }

        guard !patches.isEmpty else { return nil }
        return OverlaySurface(
            windowID: windowID,
            frame: appKitWindow,
            appearance: appearance,
            patches: patches
        )
    }

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
