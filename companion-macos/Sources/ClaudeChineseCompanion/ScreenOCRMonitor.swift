import AppKit
import CoreGraphics
import Vision
import CompanionCore

@MainActor
final class ScreenOCRMonitor {
    private struct WindowSnapshot {
        let id: CGWindowID
        let bounds: CGRect
    }

    private struct Recognition {
        let text: String
        let frame: CGRect
    }

    private let bundleIdentifier = ClaudeAccessibilityMonitor.officialBundleIdentifier
    private let dictionary: TranslationDictionary
    private let coordinator: OverlayRendering
    private var timer: Timer?
    private var started = false

    init(dictionary: TranslationDictionary, coordinator: OverlayRendering) {
        self.dictionary = dictionary
        self.coordinator = coordinator
    }

    func start() {
        guard !started else { return }
        started = true
        guard ScreenCapturePermission.granted else {
            coordinator.clear()
            return
        }
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func stop() {
        started = false
        timer?.invalidate()
        timer = nil
        coordinator.clear()
    }

    func refresh() {
        guard started,
              ScreenCapturePermission.granted,
              NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundleIdentifier,
              let snapshot = frontmostClaudeWindow(),
              let image = CGWindowListCreateImage(snapshot.bounds, .optionIncludingWindow, snapshot.id, [.bestResolution]) else {
            coordinator.clear()
            return
        }

        let screen = NSScreen.screens.first { $0.frame.intersects(appKitFrame(snapshot.bounds)) } ?? NSScreen.main
        guard let screen else {
            coordinator.clear()
            return
        }
        let appWindowFrame = appKitFrame(snapshot.bounds, screen: screen)
        let observations = recognize(image)
        let labels = observations.compactMap { observation -> OverlayLabel? in
            let screenFrame = OCRCoordinateMapper.screenFrame(
                observation: observation.frame,
                in: snapshot.bounds,
                screen: screen.frame
            )
            guard OCRZonePolicy.permits(frame: screenFrame, in: appWindowFrame),
                  let translation = dictionary.translation(forVisibleText: observation.text),
                  translation != observation.text else {
                return nil
            }
            return OverlayLabel(text: translation, frame: screenFrame.insetBy(dx: -4, dy: -3))
        }
        coordinator.render(labels)
    }

    private func frontmostClaudeWindow() -> WindowSnapshot? {
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first else { return nil }
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        return windows.compactMap { info in
            guard let ownerPID = info[kCGWindowOwnerPID as String] as? Int,
                  ownerPID == app.processIdentifier,
                  let layer = info[kCGWindowLayer as String] as? Int,
                  layer == 0,
                  let id = info[kCGWindowNumber as String] as? CGWindowID,
                  let bounds = CGRect(dictionaryRepresentation: info[kCGWindowBounds as String] as! NSDictionary),
                  !bounds.isEmpty else { return nil }
            return WindowSnapshot(id: id, bounds: bounds)
        }.max { left, right in left.bounds.width * left.bounds.height < right.bounds.width * right.bounds.height }
    }

    private func recognize(_ image: CGImage) -> [Recognition] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do { try handler.perform([request]) } catch { return [] }
        return (request.results ?? []).compactMap { observation in
            guard let candidate = observation.topCandidates(1).first, !candidate.string.isEmpty else { return nil }
            return Recognition(text: candidate.string, frame: observation.boundingBox)
        }
    }

    private func appKitFrame(_ cgFrame: CGRect, screen: NSScreen? = nil) -> CGRect {
        let targetScreen = screen ?? NSScreen.screens.first { $0.frame.intersects(cgFrame) } ?? NSScreen.main
        guard let targetScreen else { return cgFrame }
        return CGRect(x: cgFrame.minX, y: targetScreen.frame.maxY - cgFrame.maxY, width: cgFrame.width, height: cgFrame.height)
    }
}
