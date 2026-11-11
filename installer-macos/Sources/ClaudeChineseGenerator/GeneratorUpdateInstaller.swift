import Foundation
import Darwin

struct GeneratorUpdateInstaller: GeneratorUpdateInstalling {
    let http: any UpdateHTTPFetching
    let helperURL: URL?
    static var receiptURL: URL { NodeProcessBridge.defaultLogDirectory.appendingPathComponent("update-result.txt") }

    func previousResult() -> String? {
        guard let result = try? String(contentsOf: Self.receiptURL, encoding: .utf8), ["installed\n", "failed\n"].contains(result) else { return nil }
        try? FileManager.default.removeItem(at: Self.receiptURL)
        return result == "installed\n" ? "生成器更新已安装。请重新生成中文副本以应用新版翻译。" : "上次更新未完成，已保留或恢复原生成器。请重试，或从 Release 页面手动安装；详情见更新日志。"
    }
    init(http: any UpdateHTTPFetching = UpdateHTTPClient(), helperURL: URL? = Bundle.main.url(forResource: "install-update", withExtension: "sh")) {
        self.http = http
        self.helperURL = helperURL
    }

    static func validateTargetLocation(_ target: URL) throws {
        let allowed = [URL(fileURLWithPath: "/Applications/Claude 中文生成器.app"), FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/Claude 中文生成器.app")]
        let canonical = target.standardizedFileURL
        guard target.isFileURL, allowed.contains(canonical), canonical.resolvingSymlinksInPath() == canonical else {
            throw UpdateError("请先将 Claude 中文生成器拖入“应用程序”文件夹，再安装更新；也可从 Release 页面手动下载安装包。")
        }
    }

    static func validateIdentity(_ app: URL, expectedVersion: String) throws {
        for path in [app, app.appendingPathComponent("Contents"), app.appendingPathComponent("Contents/Info.plist")] {
            let values = try path.resourceValues(forKeys: [.isSymbolicLinkKey])
            guard values.isSymbolicLink != true else { throw UpdateError("更新应用路径不能是符号链接。") }
        }
        let data = try Data(contentsOf: app.appendingPathComponent("Contents/Info.plist"))
        guard let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              plist["CFBundleIdentifier"] as? String == "com.kiletry.claude-desktop-mac-zh-cn-generator",
              plist["CFBundleShortVersionString"] as? String == expectedVersion else { throw UpdateError("更新应用的标识或版本不匹配。") }
    }

    func prepare(release: GeneratorRelease, target: URL) async throws -> PreparedGeneratorUpdate {
        try Self.validateTargetLocation(target)
        return try await prepareValidatedTarget(release: release, target: target)
    }

    // Kept separate so real DMG preparation can be exercised on an isolated fixture.
    func prepareValidatedTarget(release: GeneratorRelease, target: URL) async throws -> PreparedGeneratorUpdate {
        let fm = FileManager.default
        let parent = target.deletingLastPathComponent()
        guard fm.isWritableFile(atPath: parent.path), fm.isWritableFile(atPath: target.path) else { throw UpdateError("当前应用目录不可写，请从 Release 页面下载安装包并手动替换生成器。") }
        guard let helperURL else { throw UpdateError("缺少更新安装工具，请重新安装生成器。") }
        let info = try Data(contentsOf: target.appendingPathComponent("Contents/Info.plist"))
        guard let plist = try PropertyListSerialization.propertyList(from: info, format: nil) as? [String: Any], let previous = plist["CFBundleShortVersionString"] as? String,
              try GeneratorVersion(previous) < release.version else { throw UpdateError("当前版本已更新，请重新检查。") }
        try Self.validateIdentity(target, expectedVersion: previous)
        _ = try await Self.run("/usr/bin/codesign", ["--verify", "--deep", "--strict", target.path])
        let root = fm.temporaryDirectory.appendingPathComponent("claude-generator-update-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        let staged = parent.appendingPathComponent(".claude-generator-update-\(UUID().uuidString).app")
        let mount = root.appendingPathComponent("image", isDirectory: true)
        var mounted = false
        do {
            let dmg = root.appendingPathComponent(release.filename)
            let sumsData = try await http.data(from: release.checksumURL)
            guard let sums = String(data: sumsData, encoding: .utf8) else { throw UpdateError("无法读取更新校验信息。") }
            let expected = try UpdateVerification.expectedDigest(in: sums, filename: release.filename)
            try await http.download(from: release.dmgURL, to: dmg)
            let size = try dmg.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard Int64(size) == release.size else { throw UpdateError("下载的安装包不完整，请重试。") }
            try await Task.detached { try UpdateVerification.verifySHA256(file: dmg, expected: expected) }.value
            _ = try await Self.run("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount.path, dmg.path])
            mounted = true
            let candidate = mount.appendingPathComponent("Claude 中文生成器.app")
            try Self.validateIdentity(candidate, expectedVersion: release.version.description)
            _ = try await Self.run("/usr/bin/codesign", ["--verify", "--deep", "--strict", candidate.path])
            _ = try await Self.run("/usr/bin/ditto", [candidate.path, staged.path])
            try Self.validateIdentity(staged, expectedVersion: release.version.description)
            _ = try await Self.run("/usr/bin/codesign", ["--verify", "--deep", "--strict", staged.path])
            _ = try await Self.run("/usr/bin/hdiutil", ["detach", mount.path])
            mounted = false
            try fm.removeItem(at: dmg)
            let copiedHelper = root.appendingPathComponent("install-update.sh")
            try fm.copyItem(at: helperURL, to: copiedHelper)
            try fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: copiedHelper.path)
            // The helper and receipt survive the old bundle being moved aside.
            try fm.createDirectory(at: Self.receiptURL.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let receipt = Self.receiptURL
            return PreparedGeneratorUpdate(target: target, staged: staged, helper: copiedHelper, receipt: receipt, previousVersion: previous, version: release.version.description)
        } catch {
            if mounted { _ = try? await Self.run("/usr/bin/hdiutil", ["detach", mount.path]) }
            try? fm.removeItem(at: staged)
            try? fm.removeItem(at: root)
            throw error
        }
    }

    func handoff(_ update: PreparedGeneratorUpdate) async throws {
        do { try await launchHelper(update) }
        catch {
            try? FileManager.default.removeItem(at: update.staged)
            try? FileManager.default.removeItem(at: update.helper.deletingLastPathComponent())
            throw error
        }
    }

    private func launchHelper(_ update: PreparedGeneratorUpdate) async throws {
        let logDirectory = NodeProcessBridge.defaultLogDirectory
        try FileManager.default.createDirectory(at: logDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let log = logDirectory.appendingPathComponent("update-install.log")
        FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600])
        let handle = try FileHandle(forWritingTo: log)
        defer { try? handle.close() }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [update.helper.path, String(getpid()), update.target.path, update.staged.path, update.previousVersion, update.version, update.receipt.path, "120", "relaunch", update.ready.path]
        process.environment = ["PATH": "/usr/bin:/bin:/usr/sbin:/sbin"]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = handle
        process.standardError = handle
        let ready = update.ready
        try? FileManager.default.removeItem(at: ready)
        try process.run()
        do {
            for _ in 0..<100 {
                if (try? String(contentsOf: ready, encoding: .utf8)) == "ready\n", process.isRunning {
                    try? FileManager.default.removeItem(at: ready)
                    return
                }
                guard process.isRunning else { throw UpdateError("安装助手未能就绪，请查看 update-install.log 或手动安装。") }
                try await Task.sleep(nanoseconds: 100_000_000)
            }
            throw UpdateError("安装助手启动超时，请重试或手动安装。")
        }
        catch {
            if process.isRunning { process.terminate() }
            throw error
        }
    }

    private static func run(_ executable: String, _ arguments: [String]) async throws -> String {
        try await Task.detached {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = arguments
            process.environment = ["PATH": "/usr/bin:/bin:/usr/sbin:/sbin"]
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe
            try process.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { throw UpdateError("更新准备失败（\(URL(fileURLWithPath: executable).lastPathComponent)）。\(String(data: data, encoding: .utf8) ?? "")") }
            return String(data: data, encoding: .utf8) ?? ""
        }.value
    }
}
