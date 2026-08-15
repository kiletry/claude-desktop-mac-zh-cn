import AppKit
import CompanionCore

@main
@MainActor
final class CompanionAppDelegate: NSObject, NSApplicationDelegate {
    private var monitor: ClaudeAccessibilityMonitor?
    private var toggleItem: NSMenuItem?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "Claude 中文"
        let menu = NSMenu()
        let status = NSMenuItem(title: PermissionState.accessibility() == .granted ? "辅助功能已授权" : "需要辅助功能权限", action: nil, keyEquivalent: "")
        status.isEnabled = false
        menu.addItem(status)
        let toggle = NSMenuItem(title: "启用中文界面", action: #selector(toggleTranslation), keyEquivalent: "")
        toggle.target = self
        menu.addItem(toggle)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "退出", action: #selector(quit), keyEquivalent: "q"))
        statusItem.menu = menu
        self.statusItem = statusItem
        self.toggleItem = toggle

        if let url = Bundle.main.url(forResource: "zh-CN", withExtension: "json"),
           let dictionary = try? TranslationDictionary(resourceURL: url) {
            monitor = ClaudeAccessibilityMonitor(dictionary: dictionary, coordinator: OverlayCoordinator())
        }
    }

    @objc private func toggleTranslation() {
        guard let monitor, let toggleItem else { return }
        toggleItem.state == .on ? monitor.stop() : monitor.start()
        toggleItem.state = toggleItem.state == .on ? .off : .on
    }

    @objc private func quit() { NSApp.terminate(nil) }
}
