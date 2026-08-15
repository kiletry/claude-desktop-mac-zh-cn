import AppKit
import CompanionCore

@MainActor
final class OverlayCoordinator {
    private var panels: [OverlayPanel] = []

    func render(_ labels: [OverlayLabel]) {
        let reusablePanels = panels
        var renderedPanels: [OverlayPanel] = []

        for (index, label) in labels.enumerated() {
            let panel: OverlayPanel
            if index < reusablePanels.count {
                panel = reusablePanels[index]
                panel.setOverlayLabel(label)
            } else {
                panel = OverlayPanel(overlayLabel: label)
            }
            panel.orderFrontRegardless()
            renderedPanels.append(panel)
        }

        for panel in reusablePanels.dropFirst(labels.count) {
            panel.close()
        }
        panels = renderedPanels
    }

    func clear() {
        panels.forEach { $0.close() }
        panels.removeAll()
    }

    deinit {
        let panels = panels
        Task { @MainActor in
            panels.forEach { $0.close() }
        }
    }
}
