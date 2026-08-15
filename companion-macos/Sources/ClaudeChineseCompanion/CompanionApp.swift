import AppKit
import CompanionCore
import SwiftUI

@main
@MainActor
struct CompanionApp: App {
    private let coordinator: OverlayCoordinator
    private let monitor: ClaudeAccessibilityMonitor
    @State private var enabled = false
    @State private var permission = PermissionState.accessibility()

    init() {
        let coordinator = OverlayCoordinator()
        let dictionary: TranslationDictionary
        do {
            dictionary = try TranslationDictionary.bundled()
        } catch {
            // An empty dictionary is fail-closed and leaves Claude unchanged.
            dictionary = .empty
        }
        self.coordinator = coordinator
        self.monitor = ClaudeAccessibilityMonitor(dictionary: dictionary, coordinator: coordinator)
        NSApp.setActivationPolicy(.accessory)
    }

    var body: some Scene {
        MenuBarExtra(statusTitle, systemImage: "character.book.closed") {
            Text(statusTitle)
                .font(.headline)

            Divider()

            Toggle("启用翻译", isOn: $enabled)
                .onChange(of: enabled) { value in
                    if value {
                        permission = PermissionState.accessibility()
                        if permission == .granted {
                            monitor.start()
                        } else {
                            monitor.stop()
                        }
                    } else {
                        monitor.stop()
                    }
                }

            if permission == .missing {
                Button("请求辅助功能权限") {
                    PermissionState.requestAccessibilityPrompt()
                    permission = PermissionState.accessibility()
                }
            }

            Button("退出") {
                monitor.stop()
                NSApp.terminate(nil)
            }
            .keyboardShortcut("q")
        }
        .menuBarExtraStyle(.menu)
    }

    private var statusTitle: String {
        if permission == .missing { return "需要辅助功能权限" }
        guard enabled else { return "等待 Claude" }
        let isRunning = !NSRunningApplication.runningApplications(
            withBundleIdentifier: ClaudeAccessibilityMonitor.officialBundleIdentifier
        ).isEmpty
        return isRunning ? "已启用" : "等待 Claude"
    }
}
