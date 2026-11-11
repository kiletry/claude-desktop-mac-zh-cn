import CryptoKit
import Foundation

struct GeneratorVersion: Comparable, Equatable, Sendable, CustomStringConvertible {
    private let parts: [Int]
    var description: String { parts.map(String.init).joined(separator: ".") }
    init(_ value: String) throws {
        let raw = value.hasPrefix("v") ? String(value.dropFirst()) : value
        let pieces = raw.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count == 3, pieces.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isASCIIWholeNumber) && ($0 == "0" || !$0.hasPrefix("0")) }),
              pieces.allSatisfy({ Int($0) != nil }) else { throw UpdateError("版本号格式无效。") }
        parts = pieces.map { Int($0)! }
    }
    static func < (lhs: Self, rhs: Self) -> Bool { lhs.parts.lexicographicallyPrecedes(rhs.parts) }
}

private extension Character {
    var isASCIIWholeNumber: Bool { self >= "0" && self <= "9" }
}

struct UpdateError: LocalizedError, Equatable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct GeneratorRelease: Equatable, Sendable {
    let version: GeneratorVersion
    let tag: String
    let pageURL: URL
    let notes: String
    let dmgURL: URL
    let checksumURL: URL
    let size: Int64
    var filename: String { "Claude-\(tag)-macOS.dmg" }
}

protocol UpdateHTTPFetching: Sendable {
    func data(from url: URL) async throws -> Data
    func download(from url: URL, to destination: URL) async throws
}

struct UpdateHTTPClient: UpdateHTTPFetching {
    private func request(_ url: URL, timeout: TimeInterval) -> URLRequest {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue("ClaudeChineseGenerator-Updater", forHTTPHeaderField: "User-Agent")
        return request
    }
    private func validate(_ response: URLResponse) throws {
        if let http = response as? HTTPURLResponse,
           http.statusCode == 429 || (http.statusCode == 403 && http.value(forHTTPHeaderField: "X-RateLimit-Remaining") == "0") {
            throw UpdateError("GitHub 暂时限制了检查频率，请稍后重试或从 Release 页面手动下载。")
        }
        guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode),
              let url = response.url, url.scheme == "https", url.user == nil, url.password == nil,
              ["api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].contains(url.host ?? "") else {
            let status = (response as? HTTPURLResponse).map { "（HTTP \($0.statusCode)）" } ?? ""
            throw UpdateError("无法从 GitHub 获取更新\(status)，请稍后重试。")
        }
    }
    func data(from url: URL) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request(url, timeout: 30))
        try validate(response)
        guard data.count <= 2_000_000 else { throw UpdateError("更新信息过大。") }
        return data
    }
    func download(from url: URL, to destination: URL) async throws {
        let (file, response) = try await URLSession.shared.download(for: request(url, timeout: 300))
        defer { try? FileManager.default.removeItem(at: file) }
        try validate(response)
        let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size > 0, size <= 500_000_000 else { throw UpdateError("更新安装包大小无效。") }
        try FileManager.default.moveItem(at: file, to: destination)
    }
}

protocol GeneratorUpdateChecking: Sendable {
    func check(currentVersion: String) async throws -> GeneratorRelease?
}

struct GitHubUpdateService: GeneratorUpdateChecking {
    static let publicMetadataURL = URL(string: "https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/latest/download/generator-update.json")!
    static let latestReleaseURL = URL(string: "https://api.github.com/repos/kiletry/claude-desktop-mac-zh-cn/releases/latest")!
    let http: any UpdateHTTPFetching
    init(http: any UpdateHTTPFetching = UpdateHTTPClient()) { self.http = http }

    func check(currentVersion: String) async throws -> GeneratorRelease? {
        let current = try GeneratorVersion(currentVersion)
        let metadata: Data
        do {
            metadata = try await http.data(from: Self.publicMetadataURL)
        } catch {
            let publicError = error.localizedDescription
            do { metadata = try await http.data(from: Self.latestReleaseURL) }
            catch { throw UpdateError("公开版本信息获取失败：\(publicError) GitHub API 也不可用：\(error.localizedDescription) 可从 Release 页面手动下载。") }
        }
        // Both sources use the same strict schema and repository/asset checks.
        // Invalid metadata is never bypassed by trying a less strict source.
        let response = try JSONDecoder().decode(ReleaseResponse.self, from: metadata)
        guard !response.draft, !response.prerelease else { return nil }
        let version = try GeneratorVersion(response.tag_name)
        guard version > current else { return nil }
        let tag = "v\(version)"
        guard response.tag_name == tag else { throw UpdateError("更新标签与版本不一致。") }
        let base = "https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/"
        guard response.html_url == base + "tag/" + tag,
              let pageURL = URL(string: response.html_url) else { throw UpdateError("更新页面地址无效。") }
        let dmgName = "Claude-\(tag)-macOS.dmg"
        func asset(_ name: String) throws -> ReleaseResponse.Asset {
            let matches = response.assets.filter { $0.name == name }
            guard matches.count == 1, matches[0].browser_download_url == base + "download/\(tag)/\(name)",
                  matches[0].size > 0, matches[0].size <= 500_000_000 else { throw UpdateError("缺少有效的更新安装包或校验文件。") }
            return matches[0]
        }
        let dmg = try asset(dmgName), checksums = try asset("SHA256SUMS")
        return GeneratorRelease(version: version, tag: tag, pageURL: pageURL, notes: String((response.body ?? "").prefix(8000)), dmgURL: URL(string: dmg.browser_download_url)!, checksumURL: URL(string: checksums.browser_download_url)!, size: dmg.size)
    }

    private struct ReleaseResponse: Decodable {
        struct Asset: Decodable { let name: String; let browser_download_url: String; let size: Int64 }
        let tag_name: String
        let html_url: String
        let body: String?
        let draft: Bool
        let prerelease: Bool
        let assets: [Asset]
    }
}

enum UpdateVerification {
    static func expectedDigest(in text: String, filename: String) throws -> String {
        let matches = text.split(whereSeparator: \.isNewline).compactMap { line -> String? in
            let parts = line.split(whereSeparator: \.isWhitespace)
            guard parts.count == 2, String(parts[1]).replacingOccurrences(of: "*", with: "") == filename else { return nil }
            return String(parts[0]).lowercased()
        }
        guard matches.count == 1, matches[0].count == 64, matches[0].allSatisfy({ "0123456789abcdef".contains($0) }) else { throw UpdateError("安装包校验信息无效。") }
        return matches[0]
    }
    static func verifySHA256(file: URL, expected: String) throws {
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hash = SHA256()
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty { hash.update(data: chunk) }
        let actual = hash.finalize().map { String(format: "%02x", $0) }.joined()
        guard actual == expected else { throw UpdateError("安装包校验失败，请重新下载。") }
    }
}
