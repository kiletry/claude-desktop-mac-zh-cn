import ApplicationServices

public enum PermissionState: Equatable {
    case granted
    case missing

    public static func accessibility() -> PermissionState {
        AXIsProcessTrusted() ? .granted : .missing
    }

    public static func requestAccessibilityPrompt() {
        _ = AXIsProcessTrustedWithOptions([
            kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
        ] as CFDictionary)
    }
}
