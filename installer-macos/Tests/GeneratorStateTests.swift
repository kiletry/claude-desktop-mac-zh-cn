import Foundation
import XCTest
@testable import ClaudeChineseGenerator

@MainActor
final class GeneratorStateTests: XCTestCase {
    func testCheckMakesTrustedOfficialAppReady() async {
        let bridge = StubBridge(events: [
            GeneratorEvent(event: "inspection_succeeded", stage: "inspection", message: "ok", value: .object([
                "appDir": .string("/Applications/Claude.app"),
                "bundleId": .string("com.anthropic.claude"),
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
                "bundleId": .string("com.anthropic.claude"),
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
        let viewModel = GeneratorViewModel(bridge: StubBridge(), outputAppURL: output)

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

    private func uniqueTemporaryURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }
}

private final class StubBridge: GeneratorProcessRunning {
    let events: [GeneratorEvent]
    let error: NodeProcessBridgeError?

    init(events: [GeneratorEvent] = [], error: NodeProcessBridgeError? = nil) {
        self.events = events
        self.error = error
    }

    func run(arguments: [String], environment: [String: String], onEvent: @escaping (GeneratorEvent) -> Void) async throws -> ProcessResult {
        events.forEach(onEvent)
        if let error { throw error }
        return ProcessResult(exitCode: 0, stdout: "", stderr: "", logURL: FileManager.default.temporaryDirectory)
    }

    func cancel() {}
}
