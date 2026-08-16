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
    private var monitor: ScreenOCRMonitor?
    private var toggleItem: NSMenuItem?
    private var statusItem: NSStatusItem?
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "Claude 中文"
        let menu = NSMenu()
        let status = NSMenuItem(title: ScreenCapturePermission.granted ? "屏幕录制已授权" : "需要屏幕录制权限", action: nil, keyEquivalent: "")
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

        if let dictionary = try? TranslationDictionary.bundled() {
            monitor = ScreenOCRMonitor(dictionary: dictionary, coordinator: OverlayCoordinator())
        }
        showWindow()
    }

    @objc private func toggleTranslation() {
        guard let monitor, let toggleItem else { return }
        if toggleItem.state == .on {
            monitor.stop()
            toggleItem.state = .off
            return
        }
        guard ScreenCapturePermission.granted else {
            ScreenCapturePermission.request()
            ScreenCapturePermission.openSettings()
            monitor.start()
            showPermissionGuidance()
            return
        }
        monitor.start()
        toggleItem.state = .on
        NSRunningApplication.runningApplications(withBundleIdentifier: ClaudeAccessibilityMonitor.officialBundleIdentifier)
            .first?
            .activate(options: [.activateIgnoringOtherApps])
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
        let instructions = NSTextField(wrappingLabelWithString: "1. 在系统设置中允许“屏幕录制”权限。\n2. 在右上角菜单栏点击“Claude 中文”。\n3. 选择“启用中文界面”。")
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

    private func showPermissionGuidance() {
        let alert = NSAlert()
        alert.messageText = "需要屏幕录制权限"
        alert.informativeText = "请在“系统设置 → 隐私与安全性 → 屏幕录制”中启用“Claude 中文伴侣”，然后再次点击“启用中文界面”。"
        alert.addButton(withTitle: "知道了")
        alert.runModal()
    }
}
