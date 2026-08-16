@MainActor
protocol TranslationMonitoring: AnyObject {
    func start()
    func stop()
}

extension ClaudeAccessibilityMonitor: TranslationMonitoring {}

@MainActor
final class TranslationActivationController {
    private let monitor: TranslationMonitoring
    private let permissionState: () -> PermissionState
    private let requestPrompt: () -> Void
    private let showGuidance: () -> Void
    private let activateClaude: () -> Void

    init(
        monitor: TranslationMonitoring,
        permissionState: @escaping () -> PermissionState = PermissionState.accessibility,
        requestPrompt: @escaping () -> Void = PermissionState.requestAccessibilityPrompt,
        showGuidance: @escaping () -> Void,
        activateClaude: @escaping () -> Void
    ) {
        self.monitor = monitor
        self.permissionState = permissionState
        self.requestPrompt = requestPrompt
        self.showGuidance = showGuidance
        self.activateClaude = activateClaude
    }

    func enable() -> Bool {
        guard permissionState() == .granted else {
            requestPrompt()
            showGuidance()
            return false
        }
        monitor.start()
        activateClaude()
        return true
    }

    func disable() {
        monitor.stop()
    }
}
