import AppKit
import CompanionCore

@MainActor
protocol OverlayPanelManaging: AnyObject {
    func update(_ surface: OverlaySurface)
    func show()
    func hide()
}

@MainActor
final class OverlayPanel: NSPanel, OverlayPanelManaging {
    private let canvas: OverlayCanvasView

    init(surface: OverlaySurface) {
        canvas = OverlayCanvasView(surface: surface)
        super.init(
            contentRect: surface.frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        ignoresMouseEvents = true
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = canvas
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    func update(_ surface: OverlaySurface) {
        setFrame(surface.frame, display: false)
        canvas.update(surface)
    }

    func show() { orderFrontRegardless() }
    func hide() { orderOut(nil) }
}
