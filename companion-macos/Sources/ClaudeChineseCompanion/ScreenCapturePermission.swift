import CoreGraphics

enum ScreenCapturePermission {
    static var granted: Bool {
        CGPreflightScreenCaptureAccess()
    }

    static func request() {
        _ = CGRequestScreenCaptureAccess()
    }
}
