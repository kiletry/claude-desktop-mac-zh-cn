import AppKit
import CompanionCore

@main
enum CompanionApplication {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        let delegate = CompanionAppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
        withExtendedLifetime(delegate) {}
    }
}

@MainActor
final class CompanionAppDelegate: NSObject, NSApplicationDelegate {
    private var monitor: ClaudeAccessibilityMonitor?
    private var toggleItem: NSMenuItem?
    private var statusItem: NSStatusItem?
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
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
        showWindow()
    }

    @objc private func toggleTranslation() {
        guard let monitor, let toggleItem else { return }
        toggleItem.state == .on ? monitor.stop() : monitor.start()
        toggleItem.state = toggleItem.state == .on ? .off : .on
    }

    @objc private func quit() { NSApp.terminate(nil) }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    private func showWindow() {
        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 430, height: 190))
        let title = NSTextField(labelWithString: "Claude 中文伴侣")
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.frame = NSRect(x: 28, y: 135, width: 360, height: 30)
        let instructions = NSTextField(wrappingLabelWithString: "1. 在系统设置中允许“辅助功能”权限。\n2. 在右上角菜单栏点击“Claude 中文”。\n3. 选择“启用中文界面”。")
        instructions.frame = NSRect(x: 28, y: 60, width: 370, height: 65)
        let enable = NSButton(title: "启用中文界面", target: self, action: #selector(toggleTranslation))
        enable.frame = NSRect(x: 28, y: 20, width: 135, height: 28)
        content.addSubview(title)
        content.addSubview(instructions)
        content.addSubview(enable)
        let window = NSWindow(contentRect: content.frame, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Claude 中文伴侣"
        window.contentView = content
        window.center()
        self.window = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
