#!/bin/zsh
set -euo pipefail

app_path=${1:?Usage: verify-companion-window.zsh '/path/to/Claude Chinese Companion.app'}
executable="$app_path/Contents/MacOS/ClaudeChineseCompanion"
swift_bin=${VERIFY_COMPANION_WINDOW_SWIFT_BIN:-/usr/bin/swift}

if [[ ! -x "$executable" ]]; then
  print -u2 "Companion executable not found: $executable"
  exit 2
fi

"$executable" &
companion_pid=$!
trap 'kill "$companion_pid" 2>/dev/null || true' EXIT

for _ in {1..20}; do
  sleep 0.1
  if "$swift_bin" -e '
    import AppKit
    let targetPID = Int(CommandLine.arguments[1])!
    let windowInfo = CGWindowListCopyWindowInfo(
      [.optionOnScreenOnly, .excludeDesktopElements],
      kCGNullWindowID
    ) as? [[String: Any]] ?? []
    let hasVisibleWindow = windowInfo.contains { info in
      let ownerPID = (info[kCGWindowOwnerPID as String] as? NSNumber)?.intValue
      let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue
      let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 0
      let bounds = info[kCGWindowBounds as String] as? [String: Any] ?? [:]
      let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0
      let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0
      return ownerPID == targetPID && layer == 0 && alpha > 0 && width > 0 && height > 0
    }
    exit(hasVisibleWindow ? 0 : 1)
  ' "$companion_pid"; then
    print "Companion guidance window is visible (pid: $companion_pid)."
    exit 0
  fi
done

print -u2 "Companion launched but did not create a visible guidance window (pid: $companion_pid)."
exit 1
