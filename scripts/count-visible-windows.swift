#!/usr/bin/swift

import CoreGraphics
import Foundation

struct Options {
    var fixturePath: String?
    var layer: Int?
    var pids: Set<Int> = []
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(64)
}

func parseOptions(_ arguments: [String]) -> Options {
    var options = Options()
    var index = 0
    while index < arguments.count {
        let argument = arguments[index]
        switch argument {
        case "--fixture":
            index += 1
            guard index < arguments.count else { fail("--fixture requires a path") }
            options.fixturePath = arguments[index]
        case "--layer":
            index += 1
            guard index < arguments.count, let layer = Int(arguments[index]) else {
                fail("--layer requires an integer")
            }
            options.layer = layer
        case "--pid":
            index += 1
            guard index < arguments.count, let pid = Int(arguments[index]), pid > 0 else {
                fail("--pid requires a positive integer")
            }
            options.pids.insert(pid)
        default:
            fail("Unknown argument: \(argument)")
        }
        index += 1
    }
    guard options.layer != nil else { fail("Missing required --layer") }
    guard !options.pids.isEmpty else { fail("At least one --pid is required") }
    return options
}

func loadWindows(fixturePath: String?) throws -> [[String: Any]] {
    if let fixturePath {
        let data = try Data(contentsOf: URL(fileURLWithPath: fixturePath))
        guard let windows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            fail("Window fixture must be a JSON array of dictionaries")
        }
        return windows
    }
    return CGWindowListCopyWindowInfo(
        [.optionAll, .excludeDesktopElements],
        kCGNullWindowID
    ) as? [[String: Any]] ?? []
}

let options = parseOptions(Array(CommandLine.arguments.dropFirst()))

do {
    let windows = try loadWindows(fixturePath: options.fixturePath)
    let count = windows.filter { info in
        let ownerPID = (info[kCGWindowOwnerPID as String] as? NSNumber)?.intValue
        let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue
        let isOnScreen = (info[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue ?? false
        let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 0
        let bounds = info[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0
        let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0
        return ownerPID.map(options.pids.contains) == true
            && layer == options.layer
            && isOnScreen
            && alpha > 0
            && width > 0
            && height > 0
    }.count
    print(count)
} catch {
    fail("Unable to read WindowServer data: \(error.localizedDescription)")
}
