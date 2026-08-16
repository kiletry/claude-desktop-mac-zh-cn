import AppKit
import ApplicationServices
import CompanionCore

private let accessibilityDidChangeNotification = Notification.Name(
    "ClaudeAccessibilityMonitorAccessibilityDidChange"
)

public struct AccessibilitySnapshot: Equatable, Sendable {
    public let windowID: CGWindowID
    public let windowFrame: CGRect
    public let display: DisplayGeometry
    public let appearance: OverlayAppearance
    public let elements: [AccessibilityElement]

    public init(
        windowID: CGWindowID,
        windowFrame: CGRect,
        display: DisplayGeometry,
        appearance: OverlayAppearance,
        elements: [AccessibilityElement]
    ) {
        self.windowID = windowID
        self.windowFrame = windowFrame
        self.display = display
        self.appearance = appearance
        self.elements = elements
    }
}

@MainActor
public protocol OverlayRendering: AnyObject {
    func render(_ surface: OverlaySurface)
    /// Temporary legacy OCR adapter. Task 5 removes it after its callers migrate.
    func render(_ labels: [OverlayLabel])
    func clear()
}

@MainActor
public final class ClaudeAccessibilityMonitor {
    nonisolated public static let officialBundleIdentifier = "com.anthropic.claudefordesktop"

    private static let notifications = [
        kAXFocusedWindowChangedNotification as String,
        kAXFocusedUIElementChangedNotification as String,
        kAXWindowCreatedNotification as String,
        kAXUIElementDestroyedNotification as String,
        kAXMovedNotification as String,
        kAXResizedNotification as String,
        kAXLayoutChangedNotification as String,
        kAXTitleChangedNotification as String,
        kAXValueChangedNotification as String,
        kAXSelectedChildrenChangedNotification as String,
        kAXSelectedRowsChangedNotification as String,
        kAXSelectedColumnsChangedNotification as String,
        kAXMenuOpenedNotification as String,
        kAXMenuClosedNotification as String
    ]

    private let bundleIdentifier: String
    private let dictionary: TranslationDictionary
    private let coordinator: OverlayRendering
    private let snapshotResolver: () -> AccessibilitySnapshot?
    private let frontmostBundleIdentifier: () -> String?
    private let permissionState: () -> PermissionState
    private static var sharedAXObserver: AXObserver?
    private static var observedPID: pid_t?
    private static var observedTarget: AXUIElement?
    private var started = false
    private var refreshTimer: Timer?
    private var workspaceObservers: [NSObjectProtocol] = []
    private var accessibilityObserver: NSObjectProtocol?

    public init(
        bundleIdentifier: String = ClaudeAccessibilityMonitor.officialBundleIdentifier,
        dictionary: TranslationDictionary,
        coordinator: OverlayRendering,
        snapshotResolver: (() -> AccessibilitySnapshot?)? = nil,
        frontmostBundleIdentifier: @escaping () -> String? = {
            NSWorkspace.shared.frontmostApplication?.bundleIdentifier
        },
        permissionState: @escaping () -> PermissionState = PermissionState.accessibility
    ) {
        self.bundleIdentifier = bundleIdentifier
        self.dictionary = dictionary
        self.coordinator = coordinator
        self.snapshotResolver = snapshotResolver ?? { Self.resolveSnapshot(bundleIdentifier: bundleIdentifier) }
        self.frontmostBundleIdentifier = frontmostBundleIdentifier
        self.permissionState = permissionState
    }

    public func start() {
        guard !started else { return }
        started = true

        let workspaceCenter = NSWorkspace.shared.notificationCenter
        let names: [Notification.Name] = [
            NSWorkspace.didLaunchApplicationNotification,
            NSWorkspace.didTerminateApplicationNotification,
            NSWorkspace.didActivateApplicationNotification
        ]
        workspaceObservers = names.map { name in
            workspaceCenter.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in
                    self?.scheduleRefresh()
                }
            }
        }
        accessibilityObserver = NotificationCenter.default.addObserver(
            forName: accessibilityDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.scheduleRefresh()
            }
        }

        guard permissionState() == .granted else {
            coordinator.clear()
            return
        }
        refresh()
    }

    public func stop() {
        guard started else {
            coordinator.clear()
            return
        }
        started = false
        refreshTimer?.invalidate()
        refreshTimer = nil
        workspaceObservers.forEach(NSWorkspace.shared.notificationCenter.removeObserver)
        workspaceObservers.removeAll()
        if let accessibilityObserver {
            NotificationCenter.default.removeObserver(accessibilityObserver)
            self.accessibilityObserver = nil
        }
        Self.removeAXObserver()
        coordinator.clear()
    }

    public func refresh() {
        guard bundleIdentifier == Self.officialBundleIdentifier,
              frontmostBundleIdentifier() == Self.officialBundleIdentifier else {
            Self.removeAXObserver()
            coordinator.clear()
            return
        }
        guard permissionState() == .granted else {
            Self.removeAXObserver()
            coordinator.clear()
            return
        }

        guard let snapshot = snapshotResolver() else {
            coordinator.clear()
            return
        }

        let translations = translations(for: snapshot)
        guard let surface = OverlayLayout.surface(
            windowID: snapshot.windowID,
            windowFrame: snapshot.windowFrame,
            display: snapshot.display,
            appearance: snapshot.appearance,
            translations: translations
        ) else {
            coordinator.clear()
            return
        }
        coordinator.render(surface)
    }

    private func translations(for snapshot: AccessibilitySnapshot) -> [(AccessibilityElement, String)] {
        snapshot.elements.compactMap { candidate in
            guard let approvedSource = StaticInterfacePolicy.approvedSource(
                for: candidate,
                windowFrame: snapshot.windowFrame
            ),
                  let chinese = dictionary.translation(forVisibleText: approvedSource.text) else {
                return nil
            }
            return (Self.sanitized(candidate, approvedSource: approvedSource), chinese)
        }
    }

    private func scheduleRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.refresh()
            }
        }
    }

    private static func installAXObserverIfNeeded(for target: AXUIElement, pid: pid_t) {
        guard observedPID != pid else { return }
        removeAXObserver()
        var observer: AXObserver?
        let result = AXObserverCreate(pid, axObserverCallback, &observer)
        guard result == .success, let observer else { return }
        for notification in Self.notifications {
            AXObserverAddNotification(observer, target, notification as CFString, nil)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        sharedAXObserver = observer
        observedPID = pid
        observedTarget = target
    }

    private static func removeAXObserver() {
        guard let sharedAXObserver else {
            observedPID = nil
            observedTarget = nil
            return
        }
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(sharedAXObserver), .commonModes)
        self.sharedAXObserver = nil
        observedPID = nil
        observedTarget = nil
    }

    private static func resolveSnapshot(bundleIdentifier: String) -> AccessibilitySnapshot? {
        guard bundleIdentifier == Self.officialBundleIdentifier,
              let application = NSWorkspace.shared.frontmostApplication,
              application.bundleIdentifier == Self.officialBundleIdentifier else {
            return nil
        }
        let target = AXUIElementCreateApplication(application.processIdentifier)
        installAXObserverIfNeeded(for: target, pid: application.processIdentifier)
        guard let focusedWindow = elementAttribute(kAXFocusedWindowAttribute, from: target),
              boolAttribute(kAXMinimizedAttribute, from: focusedWindow) == false,
              let windowID = windowID(of: focusedWindow),
              let windowFrame = frame(of: focusedWindow),
              !windowFrame.isNull,
              !windowFrame.isEmpty,
              let display = displayGeometry(for: windowFrame),
              let appearance = currentAppearance() else {
            return nil
        }

        var elements: [AccessibilityElement] = []
        var nodeCount = 0
        walk(
            focusedWindow,
            ancestors: [],
            windowFrame: windowFrame,
            depth: 0,
            count: &nodeCount,
            into: &elements
        )
        return AccessibilitySnapshot(
            windowID: windowID,
            windowFrame: windowFrame,
            display: display,
            appearance: appearance,
            elements: elements
        )
    }

    private static func walk(
        _ element: AXUIElement,
        ancestors: [String],
        windowFrame: CGRect,
        depth: Int,
        count: inout Int,
        into elements: inout [AccessibilityElement]
    ) {
        guard depth < 12, count < 800 else { return }
        count += 1
        let role = stringAttribute(kAXRoleAttribute, from: element) ?? ""
        let elementFrame = frame(of: element)
        if StaticInterfacePolicy.mayReadText(role: role, ancestorRoles: ancestors),
           let elementFrame,
           AccessibilityZonePolicy.permits(frame: elementFrame, in: windowFrame) {
            let candidate = AccessibilityElement(
                role: role,
                title: stringAttribute(kAXTitleAttribute, from: element),
                value: stringAttribute(kAXValueAttribute, from: element),
                identifier: stringAttribute(kAXIdentifierAttribute, from: element),
                isEnabled: boolAttribute(kAXEnabledAttribute, from: element),
                parentRole: ancestors.last,
                ancestorRoles: ancestors,
                frame: elementFrame
            )
            if let approvedSource = StaticInterfacePolicy.approvedSource(
                for: candidate,
                windowFrame: windowFrame
            ) {
                elements.append(sanitized(candidate, approvedSource: approvedSource))
            }
        }

        let nextAncestors = ancestors + [role]
        for child in childrenAttribute(kAXChildrenAttribute, from: element) {
            walk(
                child,
                ancestors: nextAncestors,
                windowFrame: windowFrame,
                depth: depth + 1,
                count: &count,
                into: &elements
            )
        }
    }

    private static func displayGeometry(for windowFrame: CGRect) -> DisplayGeometry? {
        var displayCount: UInt32 = 0
        guard CGGetActiveDisplayList(0, nil, &displayCount) == .success,
              displayCount > 0 else {
            return nil
        }
        var displayIDs = [CGDirectDisplayID](repeating: 0, count: Int(displayCount))
        guard CGGetActiveDisplayList(displayCount, &displayIDs, &displayCount) == .success else {
            return nil
        }

        let topLeft = CGPoint(x: windowFrame.minX, y: windowFrame.minY)
        let matchingIDs = displayIDs.prefix(Int(displayCount)).filter { displayID in
            contains(topLeft, in: CGDisplayBounds(displayID))
        }
        guard matchingIDs.count == 1, let displayID = matchingIDs.first else { return nil }

        let matchingScreens = NSScreen.screens.filter { screen in
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
                return false
            }
            return CGDirectDisplayID(number.uint32Value) == displayID
        }
        guard matchingScreens.count == 1, let screen = matchingScreens.first else { return nil }
        return DisplayGeometry(
            accessibilityFrame: CGDisplayBounds(displayID),
            appKitFrame: screen.frame
        )
    }

    private static func sanitized(
        _ candidate: AccessibilityElement,
        approvedSource: StaticInterfacePolicy.ApprovedSource
    ) -> AccessibilityElement {
        let title: String?
        let value: String?
        switch approvedSource {
        case .title(let text):
            title = text
            value = nil
        case .value(let text):
            title = nil
            value = text
        }
        return AccessibilityElement(
            role: candidate.role,
            title: title,
            value: value,
            identifier: candidate.identifier,
            isEnabled: candidate.isEnabled,
            parentRole: candidate.parentRole,
            ancestorRoles: candidate.ancestorRoles,
            frame: candidate.frame
        )
    }

    private static func contains(_ point: CGPoint, in frame: CGRect) -> Bool {
        point.x >= frame.minX && point.x < frame.maxX &&
        point.y >= frame.minY && point.y < frame.maxY
    }

    private static func currentAppearance() -> OverlayAppearance? {
        guard let match = NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) else {
            return nil
        }
        switch match {
        case .aqua:
            return .light
        case .darkAqua:
            return .dark
        default:
            return nil
        }
    }

    private static func windowID(of element: AXUIElement) -> CGWindowID? {
        guard let number = attribute("AXWindowNumber", from: element) as? NSNumber else { return nil }
        return CGWindowID(number.uint32Value)
    }

    private static func attribute(_ key: String, from element: AXUIElement) -> Any? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success else {
            return nil
        }
        return value
    }

    private static func stringAttribute(_ key: String, from element: AXUIElement) -> String? {
        attribute(key, from: element) as? String
    }

    private static func boolAttribute(_ key: String, from element: AXUIElement) -> Bool? {
        guard let number = attribute(key, from: element) as? NSNumber else { return nil }
        return number.boolValue
    }

    private static func childrenAttribute(_ key: String, from element: AXUIElement) -> [AXUIElement] {
        attribute(key, from: element) as? [AXUIElement] ?? []
    }

    private static func elementAttribute(_ key: String, from element: AXUIElement) -> AXUIElement? {
        guard let value = attribute(key, from: element) else { return nil }
        return unsafeBitCast(value, to: AXUIElement.self)
    }

    private static func axValueAttribute(_ key: String, from element: AXUIElement) -> AXValue? {
        guard let value = attribute(key, from: element) else { return nil }
        return unsafeBitCast(value, to: AXValue.self)
    }

    private static func frame(of element: AXUIElement) -> CGRect? {
        guard let positionValue = axValueAttribute(kAXPositionAttribute, from: element),
              let sizeValue = axValueAttribute(kAXSizeAttribute, from: element) else {
            return nil
        }
        var position = CGPoint.zero
        var size = CGSize.zero
        guard AXValueGetValue(positionValue, .cgPoint, &position),
              AXValueGetValue(sizeValue, .cgSize, &size) else {
            return nil
        }
        return CGRect(origin: position, size: size)
    }
}

private let axObserverCallback: AXObserverCallback = { _, _, _, _ in
    NotificationCenter.default.post(name: accessibilityDidChangeNotification, object: nil)
}
