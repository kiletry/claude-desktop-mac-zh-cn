import Foundation

struct ProcessResult: Equatable, Sendable {
    let exitCode: Int32
    let stdout: String
    let stderr: String
    let logURL: URL
}

enum NodeProcessBridgeError: Error, Equatable, Sendable {
    case nonZeroExit(ProcessResult)
    case launchFailed(String)
}

protocol GeneratorProcessRunning: AnyObject {
    func run(arguments: [String], environment: [String: String], onEvent: @escaping (GeneratorEvent) -> Void) async throws -> ProcessResult
    func cancel()
}

final class NodeProcessBridge: GeneratorProcessRunning, @unchecked Sendable {
    private let executableURL: URL
    private let logDirectory: URL
    private let processLock = NSLock()
    private var runningProcess: Process?

    init(executableURL: URL, logDirectory: URL = NodeProcessBridge.defaultLogDirectory) {
        self.executableURL = executableURL
        self.logDirectory = logDirectory
    }

    static var defaultLogDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/ClaudeChineseGenerator", isDirectory: true)
    }

    static var bundledNodeURL: URL {
        Bundle.main.url(forResource: "node", withExtension: nil, subdirectory: "runtime")
            ?? URL(fileURLWithPath: "/usr/bin/node")
    }

    static var bundledCommandPrefix: [String] {
        guard let commandURL = Bundle.main.url(forResource: "claude-desktop-mac-zh-cn", withExtension: "mjs", subdirectory: "runtime/package/bin") else {
            return []
        }
        return [commandURL.path]
    }

    func run(arguments: [String], environment: [String: String], onEvent: @escaping (GeneratorEvent) -> Void) async throws -> ProcessResult {
        try Task.checkCancellation()
        let process = Process()
        process.executableURL = executableURL
        process.arguments = arguments.contains("--json-events") ? arguments : arguments + ["--json-events"]
        process.environment = sanitizedEnvironment(environment)

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe
        let exitWaiter = ProcessExitWaiter()
        process.terminationHandler = { _ in exitWaiter.finish() }
        let output = ProcessOutputCollector(onEvent: onEvent)
        stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
            output.appendStdout(handle.availableData)
        }
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            output.appendStderr(handle.availableData)
        }

        do {
            processLock.withLock { runningProcess = process }
            try process.run()
        } catch {
            clear(process)
            stdoutPipe.fileHandleForReading.readabilityHandler = nil
            stderrPipe.fileHandleForReading.readabilityHandler = nil
            throw NodeProcessBridgeError.launchFailed(error.localizedDescription)
        }

        await withTaskCancellationHandler(operation: {
            await exitWaiter.wait()
        }, onCancel: { [weak self] in
            self?.cancel()
        })
        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        stderrPipe.fileHandleForReading.readabilityHandler = nil
        output.appendRemaining(stdoutPipe.fileHandleForReading.readDataToEndOfFile(), to: .stdout)
        output.appendRemaining(stderrPipe.fileHandleForReading.readDataToEndOfFile(), to: .stderr)
        output.finish()
        clear(process)

        if Task.isCancelled { throw CancellationError() }
        let result = try makeResult(exitCode: process.terminationStatus, output: output)
        if result.exitCode != 0 { throw NodeProcessBridgeError.nonZeroExit(result) }
        return result
    }

    func cancel() {
        processLock.lock()
        let process = runningProcess
        processLock.unlock()
        guard let process, process.isRunning else { return }
        process.terminate()
    }

    private func clear(_ process: Process) {
        processLock.lock()
        if runningProcess === process { runningProcess = nil }
        processLock.unlock()
    }

    private func makeResult(exitCode: Int32, output: ProcessOutputCollector) throws -> ProcessResult {
        let stdout = output.stdout
        let stderr = output.stderr
        let log = LogRedactor.redact("stdout:\n\(stdout)\n\nstderr:\n\(stderr)\n")
        try FileManager.default.createDirectory(at: logDirectory, withIntermediateDirectories: true)
        let logURL = logDirectory.appendingPathComponent("generator-\(ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-"))-\(UUID().uuidString).log")
        try log.write(to: logURL, atomically: true, encoding: .utf8)
        return ProcessResult(exitCode: exitCode, stdout: LogRedactor.redact(stdout), stderr: LogRedactor.redact(stderr), logURL: logURL)
    }

    private func sanitizedEnvironment(_ environment: [String: String]) -> [String: String] {
        environment.filter { key, _ in
            let name = key.lowercased()
            return !["token", "secret", "password", "credential", "cookie", "apikey", "api_key", "oauth"].contains { name.contains($0) }
        }
    }
}

private final class ProcessExitWaiter: @unchecked Sendable {
    private let lock = NSLock()
    private var finished = false
    private var continuation: CheckedContinuation<Void, Never>?

    func wait() async {
        await withCheckedContinuation { continuation in
            lock.withLock {
                if finished {
                    continuation.resume()
                } else {
                    self.continuation = continuation
                }
            }
        }
    }

    func finish() {
        lock.withLock {
            finished = true
            continuation?.resume()
            continuation = nil
        }
    }
}

private final class ProcessOutputCollector: @unchecked Sendable {
    enum Stream { case stdout, stderr }

    private let lock = NSLock()
    private let onEvent: (GeneratorEvent) -> Void
    private var stdoutBuffer = Data()
    private var stdoutLineBuffer = Data()
    private var stderrBuffer = Data()

    init(onEvent: @escaping (GeneratorEvent) -> Void) { self.onEvent = onEvent }

    var stdout: String { lock.withLock { String(decoding: stdoutBuffer, as: UTF8.self) } }
    var stderr: String { lock.withLock { String(decoding: stderrBuffer, as: UTF8.self) } }

    func appendStdout(_ data: Data) { append(data, to: .stdout) }
    func appendStderr(_ data: Data) { append(data, to: .stderr) }

    func appendRemaining(_ data: Data, to stream: Stream) {
        guard !data.isEmpty else { return }
        append(data, to: stream)
    }

    func finish() {
        lock.withLock {
            guard !stdoutLineBuffer.isEmpty else { return }
            decodeEvent(stdoutLineBuffer)
            stdoutLineBuffer.removeAll()
        }
    }

    private func append(_ data: Data, to stream: Stream) {
        guard !data.isEmpty else { return }
        lock.withLock {
            switch stream {
            case .stdout:
                stdoutBuffer.append(data)
                stdoutLineBuffer.append(data)
                while let newline = stdoutLineBuffer.firstIndex(of: 10) {
                    let line = stdoutLineBuffer.prefix(upTo: newline)
                    decodeEvent(Data(line))
                    stdoutLineBuffer.removeSubrange(...newline)
                }
            case .stderr: stderrBuffer.append(data)
            }
        }
    }

    private func decodeEvent(_ data: Data) {
        guard !data.isEmpty, let event = try? JSONDecoder().decode(GeneratorEvent.self, from: data) else { return }
        onEvent(event)
    }
}

private extension NSLock {
    func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock(); defer { unlock() }
        return try body()
    }
}
