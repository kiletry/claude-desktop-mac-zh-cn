import AppKit
import CompanionCore

final class OverlayCanvasView: NSView {
    private var surface: OverlaySurface

    init(surface: OverlaySurface) {
        self.surface = surface
        super.init(frame: CGRect(origin: .zero, size: surface.frame.size))
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
    }

    required init?(coder: NSCoder) { nil }

    func update(_ surface: OverlaySurface) {
        self.surface = surface
        frame = CGRect(origin: .zero, size: surface.frame.size)
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        for patch in surface.patches where patch.frame.intersects(dirtyRect) {
            let background: NSColor = surface.appearance == .dark
                ? NSColor(calibratedWhite: 0.12, alpha: 1)
                : NSColor(calibratedWhite: 0.98, alpha: 1)
            let foreground: NSColor
            if patch.isEnabled {
                foreground = surface.appearance == .dark
                    ? NSColor(calibratedWhite: 0.90, alpha: 1)
                    : NSColor(calibratedWhite: 0.16, alpha: 1)
            } else {
                foreground = NSColor.secondaryLabelColor
            }

            background.setFill()
            patch.frame.fill()
            (patch.text as NSString).draw(
                in: patch.frame,
                withAttributes: [
                    .font: NSFont.systemFont(ofSize: 13, weight: .medium),
                    .foregroundColor: foreground,
                    .paragraphStyle: paragraphStyle
                ]
            )
        }
    }

    private var paragraphStyle: NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.alignment = .left
        style.lineBreakMode = .byClipping
        return style
    }
}
