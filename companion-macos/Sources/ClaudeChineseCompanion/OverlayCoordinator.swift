import AppKit
import CompanionCore

@MainActor
public final class OverlayCoordinator: OverlayRendering {
    private static let legacyWindowID = CGWindowID.max

    private var panels: [CGWindowID: any OverlayPanelManaging] = [:]
    private let panelFactory: @MainActor (OverlaySurface) -> any OverlayPanelManaging

    init(panelFactory: @MainActor @escaping (OverlaySurface) -> any OverlayPanelManaging = { OverlayPanel(surface: $0) }) {
        self.panelFactory = panelFactory
    }

    public func render(_ surface: OverlaySurface) {
        for (windowID, panel) in panels where windowID != surface.windowID {
            panel.hide()
        }

        if let panel = panels[surface.windowID] {
            panel.update(surface)
            panel.show()
        } else {
            let created = panelFactory(surface)
            created.show()
            panels[surface.windowID] = created
        }
    }

    /// Temporary Task 3 adapter for the legacy OCR monitor. Task 5 removes this API.
    @available(*, deprecated, message: "Render OverlaySurface values instead. This compatibility adapter is removed in Task 5.")
    public func render(_ labels: [OverlayLabel]) {
        guard let surface = legacySurface(from: labels) else {
            clear()
            return
        }
        render(surface)
    }

    public func clear() {
        panels.values.forEach { $0.hide() }
        panels.removeAll()
    }

    private func legacySurface(from labels: [OverlayLabel]) -> OverlaySurface? {
        guard let first = labels.first else { return nil }
        let frame = labels.dropFirst().reduce(first.frame) { $0.union($1.frame) }
        guard !frame.isEmpty, !frame.isNull else { return nil }

        let effectiveAppearance = NSApplication.shared.effectiveAppearance
        let appearance: OverlayAppearance = effectiveAppearance.bestMatch(from: [.darkAqua]) == .darkAqua
            ? .dark
            : .light
        let patches = labels.map { label in
            OverlayPatch(
                text: label.text,
                frame: label.frame.offsetBy(dx: -frame.minX, dy: -frame.minY),
                isEnabled: true
            )
        }
        return OverlaySurface(
            windowID: Self.legacyWindowID,
            frame: frame,
            appearance: appearance,
            patches: patches
        )
    }
}
