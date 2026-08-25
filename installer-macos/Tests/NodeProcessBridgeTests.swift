import Foundation
import XCTest
@testable import ClaudeChineseGenerator

final class NodeProcessBridgeTests: XCTestCase {
    func testRunParsesJsonEventsAndRedactsLog() async throws {
        let logDirectory = uniqueTemporaryURL()
        let bridge = NodeProcessBridge(executableURL: URL(fileURLWithPath: "/bin/sh"), logDirectory: logDirectory)
        var receivedEvents: [GeneratorEvent] = []

        let result = try await bridge.run(
            arguments: ["-c", "printf '%s\\n' '{\"event\":\"stage_started\",\"stage\":\"copy\",\"message\":\"copying\"}'; printf '%s' 'token=credential_fixture_value' >&2"],
            environment: ["PATH": ProcessInfo.processInfo.environment["PATH"] ?? ""],
            onEvent: { receivedEvents.append($0) }
        )

        XCTAssertEqual(result.exitCode, 0)
        XCTAssertEqual(receivedEvents.map(\.event), ["stage_started"])
        let log = try String(contentsOf: result.logURL, encoding: .utf8)
        XCTAssertFalse(log.contains("credential_fixture_value"))
        XCTAssertTrue(log.contains("[REDACTED]"))
    }

    func testRunAddsJsonEventsArgument() async throws {
        let bridge = NodeProcessBridge(executableURL: URL(fileURLWithPath: "/bin/sh"), logDirectory: uniqueTemporaryURL())

        let result = try await bridge.run(
            arguments: ["-c", "test \"$0\" = '--json-events'"],
            environment: ["PATH": ProcessInfo.processInfo.environment["PATH"] ?? ""],
            onEvent: { _ in }
        )

        XCTAssertEqual(result.exitCode, 0)
    }

    func testCancellationTerminatesChildProcess() async throws {
        let bridge = NodeProcessBridge(executableURL: URL(fileURLWithPath: "/bin/sh"), logDirectory: uniqueTemporaryURL())
        let started = Date()
        let task = Task {
            try await bridge.run(
                arguments: ["-c", "exec /bin/sleep 30"],
                environment: [:],
                onEvent: { _ in }
            )
        }
        try await Task.sleep(nanoseconds: 200_000_000)
        task.cancel()

        do {
            _ = try await task.value
            XCTFail("Expected cancellation")
        } catch is CancellationError {
            XCTAssertLessThan(Date().timeIntervalSince(started), 3)
        }
    }

    private func uniqueTemporaryURL() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }
}
