import AppKit
import CompanionCore

final class OverlayPanel: NSPanel {
    private let label = NSTextField(labelWithString: "")

    init(overlayLabel: OverlayLabel) {
        super.init(
            contentRect: overlayLabel.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        ignoresMouseEvents = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        label.alignment = .center
        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.textColor = .labelColor
        label.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.9)
        label.drawsBackground = true
        label.wantsLayer = true
        label.layer?.cornerRadius = 6
        label.layer?.masksToBounds = true
        contentView = label

        setOverlayLabel(overlayLabel)
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    func setOverlayLabel(_ overlayLabel: OverlayLabel) {
        setFrame(overlayLabel.frame, display: false)
        label.stringValue = overlayLabel.text
    }
}
