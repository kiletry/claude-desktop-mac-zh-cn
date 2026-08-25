import Foundation
import XCTest
@testable import ClaudeChineseGenerator

@MainActor
final class GeneratorStateTests: XCTestCase {
    func testCheckMakesTrustedOfficialAppReady() async {
        let bridge = StubBridge(events: [
            GeneratorEvent(event: "inspection_succeeded", stage: "inspection", message: "ok", value: .object([
                "appDir": .string("/Applications/Claude.app"),
                "bundleId": .string("com.anthropic.claudefordesktop"),
                "version": .string("1.2.3"),
                "signing": .object(["verified": .bool(true)]),
                "gatekeeper": .object(["accepted": .bool(true)]),
            ])),
        ])
        let viewModel = GeneratorViewModel(bridge: bridge, outputAppURL: uniqueTemporaryURL())

        await viewModel.check()

        guard case let .ready(inspection) = viewModel.state else {
            return XCTFail("Expected trusted inspection to be ready, got \(viewModel.state)")
        }
        XCTAssertEqual(inspection.version, "1.2.3")
        XCTAssertTrue(inspection.isTrustedOfficialApp)
    }

    func testCheckRejectsUntrustedOfficialApp() async {
        let bridge = StubBridge(events: [
            GeneratorEvent(event: "inspection_succeeded", stage: "inspection", message: "ok", value: .object([
                "appDir": .string("/Applications/Claude.app"),
                "bundleId": .string("com.anthropic.claudefordesktop"),
                "version": .string("1.2.3"),
                "signing": .object(["verified": .bool(false)]),
                "gatekeeper": .object(["accepted": .bool(true)]),
            ])),
        ])
        let viewModel = GeneratorViewModel(bridge: bridge, outputAppURL: uniqueTemporaryURL())

        await viewModel.check()

        guard case let .failed(error) = viewModel.state else {
            return XCTFail("Expected untrusted app to fail, got \(viewModel.state)")
        }
        XCTAssertTrue(error.message.contains("官方 Claude"))
    }

    func testExistingOutputRequiresReplacementConfirmation() async throws {
        let output = uniqueTemporaryURL()
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: output) }
        let bridge = StubBridge(events: [trustedInspectionEvent()])
        let viewModel = GeneratorViewModel(bridge: bridge, outputAppURL: output)

        await viewModel.check()
        await viewModel.confirmAndGenerate()

        XCTAssertEqual(viewModel.state, .confirmingReplacement)
    }

    func testNonzeroExitBecomesFailedWithRedactedOutput() async {
        let sensitiveValue = "credential_fixture_value"
        let result = ProcessResult(exitCode: 9, stdout: "token=\(sensitiveValue)", stderr: "", logURL: uniqueTemporaryURL())
        let bridge = StubBridge(error: .nonZeroExit(result))
        let viewModel = GeneratorViewModel(bridge: bridge, outputAppURL: uniqueTemporaryURL())

        await viewModel.confirmAndGenerate()

        guard case let .failed(error) = viewModel.state else {
            return XCTFail("Expected failed state, got \(viewModel.state)")
        }
        XCTAssertFalse(error.details.contains(sensitiveValue))
        XCTAssertTrue(error.details.contains("[REDACTED]"))
    }

    func testCommonSecretNamesAreRedacted() {
        let text = "AWS_SECRET_ACCESS_KEY=aws-secret client_secret=client-secret&access_token=query-token"
        let redacted = LogRedactor.redact(text)

        XCTAssertFalse(redacted.contains("aws-secret"))
        XCTAssertFalse(redacted.contains("client-secret"))
        XCTAssertFalse(redacted.contains("query-token"))
        XCTAssertEqual(redacted.filter { $0 == "[" }.count, 3)
    }

    func testFailedCheckCannotStartGenerationUntilRechecked() async {
        let bridge = StubBridge(error: .launchFailed("inspection failed"))
        let viewModel = GeneratorViewModel(bridge: bridge, outputAppURL: uniqueTemporaryURL())

        await viewModel.check()
        await viewModel.confirmAndGenerate()

        guard case .failed = viewModel.state else {
            return XCTFail("Expected failed state to remain failed, got \(viewModel.state)")
        }
        XCTAssertEqual(bridge.runCallCount, 1)
    }

    func testCancelGenerationCancelsViewModelTask() async {
        let bridge = BlockingBridge()
        let viewModel = GeneratorViewModel(bridge: bridge, outputAppURL: uniqueTemporaryURL())
        let generation = Task { await viewModel.confirmAndGenerate() }

        await bridge.waitUntilStarted()
        viewModel.cancelGeneration()
        await generation.value

        guard case let .failed(error) = viewModel.state else {
            return XCTFail("Expected cancelled generation to fail, got \(viewModel.state)")
        }
        XCTAssertEqual(error.message, "生成已取消。")
        XCTAssertTrue(bridge.wasCancelled)
    }

    private func uniqueTemporaryURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    private func trustedInspectionEvent() -> GeneratorEvent {
        GeneratorEvent(event: "inspection_succeeded", stage: "inspection", message: "ok", value: .object([
            "appDir": .string("/Applications/Claude.app"),
            "bundleId": .string("com.anthropic.claudefordesktop"),
            "version": .string("1.2.3"),
            "signing": .object(["verified": .bool(true)]),
            "gatekeeper": .object(["accepted": .bool(true)]),
        ]))
    }
}

private final class StubBridge: GeneratorProcessRunning {
    let events: [GeneratorEvent]
    let error: NodeProcessBridgeError?
    private(set) var runCallCount = 0

    init(events: [GeneratorEvent] = [], error: NodeProcessBridgeError? = nil) {
        self.events = events
        self.error = error
    }

    func run(arguments: [String], environment: [String: String], onEvent: @escaping (GeneratorEvent) -> Void) async throws -> ProcessResult {
        runCallCount += 1
        events.forEach(onEvent)
        if let error { throw error }
        return ProcessResult(exitCode: 0, stdout: "", stderr: "", logURL: FileManager.default.temporaryDirectory)
    }

    func cancel() {}
}

private final class BlockingBridge: GeneratorProcessRunning {
    private let lock = NSLock()
    private var startedContinuation: CheckedContinuation<Void, Never>?
    private var cancellationContinuation: CheckedContinuation<Void, Never>?
    private(set) var wasCancelled = false

    func run(arguments: [String], environment: [String: String], onEvent: @escaping (GeneratorEvent) -> Void) async throws -> ProcessResult {
        await withCheckedContinuation { continuation in
            lock.lock()
            startedContinuation = continuation
            lock.unlock()
        }
        return try await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                lock.lock()
                cancellationContinuation = continuation
                lock.unlock()
            }
            throw CancellationError()
        } onCancel: {
            cancel()
        }
    }

    func cancel() {
        lock.lock()
        wasCancelled = true
        let continuation = cancellationContinuation
        cancellationContinuation = nil
        lock.unlock()
        continuation?.resume()
    }

    func waitUntilStarted() async {
        await withCheckedContinuation { continuation in
            lock.lock()
            if startedContinuation == nil {
                lock.unlock()
                continuation.resume()
            } else {
                let original = startedContinuation
                startedContinuation = nil
                lock.unlock()
                original?.resume()
                continuation.resume()
            }
        }
    }
}
