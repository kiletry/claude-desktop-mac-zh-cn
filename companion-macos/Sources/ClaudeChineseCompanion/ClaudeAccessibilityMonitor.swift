import AppKit
import ApplicationServices
import CompanionCore

@MainActor
public protocol OverlayRendering: AnyObject {
    func render(_ labels: [OverlayLabel])
    func clear()
}

@MainActor
public final class ClaudeAccessibilityMonitor {
    nonisolated public static let officialBundleIdentifier = "com.anthropic.claudefordesktop"

    private static let blockedRoles: Set<String> = [
        "AXWebArea", "AXTextArea", "AXTextField", "AXSearchField", "AXList", "AXTable",
        "AXRow", "AXCell", "AXOutline", "AXScrollArea", "AXDocument"
    ]
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
    private let targetResolver: () -> AXUIElement?
    private var started = false
    private var refreshTimer: Timer?
    private var workspaceObservers: [NSObjectProtocol] = []
    private var axObserver: AXObserver?
    private var observedTarget: AXUIElement?

    public init(
        bundleIdentifier: String = ClaudeAccessibilityMonitor.officialBundleIdentifier,
        dictionary: TranslationDictionary,
        coordinator: OverlayRendering,
        targetResolver: (() -> AXUIElement?)? = nil
    ) {
        self.bundleIdentifier = bundleIdentifier
        self.dictionary = dictionary
        self.coordinator = coordinator
        self.targetResolver = targetResolver ?? {
            guard bundleIdentifier == Self.officialBundleIdentifier else { return nil }
            guard let application = NSRunningApplication.runningApplications(withBundleIdentifier: Self.officialBundleIdentifier).first else {
                return nil
            }
            return AXUIElementCreateApplication(application.processIdentifier)
        }
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

        guard PermissionState.accessibility() == .granted else {
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
        removeAXObserver()
        coordinator.clear()
    }

    public func refresh() {
        guard bundleIdentifier == Self.officialBundleIdentifier,
              PermissionState.accessibility() == .granted,
              let target = targetResolver() else {
            removeAXObserver()
            coordinator.clear()
            return
        }

        installAXObserverIfNeeded(for: target)
        guard let focusedWindow = elementAttribute(kAXFocusedWindowAttribute, from: target) else {
            coordinator.clear()
            return
        }

        let screenFrame = NSScreen.screens.first(where: { $0.frame.intersects(windowFrame(focusedWindow)) })?.frame
            ?? NSScreen.main?.frame
            ?? .zero
        var translated: [(AccessibilityElement, String)] = []
        var nodeCount = 0
        walk(focusedWindow, ancestors: [], depth: 0, count: &nodeCount, into: &translated)
        coordinator.render(OverlayLayout.labels(for: translated, screenFrame: screenFrame))
    }

    private func scheduleRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.refresh()
            }
        }
    }

    private func installAXObserverIfNeeded(for target: AXUIElement) {
        guard observedTarget == nil || observedTarget != target else { return }
        removeAXObserver()

        var observer: AXObserver?
        var pid: pid_t = 0
        guard AXUIElementGetPid(target, &pid) == .success else { return }
        let result = AXObserverCreate(pid, axObserverCallback, &observer)
        guard result == .success, let observer else { return }
        let context = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        for notification in Self.notifications {
            AXObserverAddNotification(observer, target, notification as CFString, context)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        self.axObserver = observer
        self.observedTarget = target
    }

    private func removeAXObserver() {
        guard let axObserver else {
            observedTarget = nil
            return
        }
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(axObserver), .commonModes)
        self.axObserver = nil
        observedTarget = nil
    }

    private func walk(
        _ element: AXUIElement,
        ancestors: [String],
        depth: Int,
        count: inout Int,
        into translated: inout [(AccessibilityElement, String)]
    ) {
        guard depth < 8, count < 400 else { return }
        count += 1
        let role = (attribute(kAXRoleAttribute, from: element) as? String) ?? ""
        let blocked = Self.blockedRoles.contains(role) || ancestors.contains(where: Self.blockedRoles.contains)
        let title = attribute(kAXTitleAttribute, from: element) as? String
        let value = attribute(kAXValueAttribute, from: element) as? String
        let parentRole = ancestors.last
        if !blocked,
           let frame = frame(of: element),
           !frame.isEmpty {
            let candidate = AccessibilityElement(role: role, title: title, value: value, parentRole: parentRole, frame: frame)
            if let chinese = dictionary.translation(for: candidate) {
                translated.append((candidate, chinese))
            }
        }

        guard !blocked,
              let children = attribute(kAXChildrenAttribute, from: element) as? [AXUIElement] else { return }
        let nextAncestors = ancestors + [role]
        for child in children {
            walk(child, ancestors: nextAncestors, depth: depth + 1, count: &count, into: &translated)
        }
    }

    private func attribute(_ key: String, from element: AXUIElement) -> Any? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success else { return nil }
        return value
    }

    private func elementAttribute(_ key: String, from element: AXUIElement) -> AXUIElement? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success,
              let value else { return nil }
        return unsafeBitCast(value, to: AXUIElement.self)
    }

    private func axValueAttribute(_ key: String, from element: AXUIElement) -> AXValue? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success,
              let value else { return nil }
        return unsafeBitCast(value, to: AXValue.self)
    }

    private func frame(of element: AXUIElement) -> CGRect? {
        guard let value = axValueAttribute(kAXPositionAttribute, from: element),
              let sizeValue = axValueAttribute(kAXSizeAttribute, from: element) else { return nil }
        var position = CGPoint.zero
        var size = CGSize.zero
        guard AXValueGetValue(value, .cgPoint, &position),
              AXValueGetValue(sizeValue, .cgSize, &size) else { return nil }
        return CGRect(origin: position, size: size)
    }

    private func windowFrame(_ element: AXUIElement) -> CGRect {
        frame(of: element) ?? .zero
    }
}

private let axObserverCallback: AXObserverCallback = { _, _, _, refcon in
    guard let refcon else { return }
    let monitor = Unmanaged<ClaudeAccessibilityMonitor>.fromOpaque(refcon).takeUnretainedValue()
    Task { @MainActor in
        monitor.scheduleRefreshFromNotification()
    }
}

extension ClaudeAccessibilityMonitor {
    fileprivate func scheduleRefreshFromNotification() {
        scheduleRefresh()
    }
}
