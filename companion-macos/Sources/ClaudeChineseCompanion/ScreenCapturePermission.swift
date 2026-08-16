import AppKit
import CoreGraphics

enum ScreenCapturePermission {
    static var granted: Bool {
        CGPreflightScreenCaptureAccess()
    }

    static func request() {
        _ = CGRequestScreenCaptureAccess()
    }

    static func openSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") else { return }
        NSWorkspace.shared.open(url)
    }
}
