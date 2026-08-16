import AppKit
import CompanionCore

@MainActor
public final class OverlayCoordinator: OverlayRendering {
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

    public func clear() {
        panels.values.forEach { $0.hide() }
        panels.removeAll()
    }
}
