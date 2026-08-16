#!/bin/zsh
set -euo pipefail

app_path=${1:?Usage: verify-single-overlay.zsh '/Applications/Claude Chinese Companion.app'}
executable="$app_path/Contents/MacOS/ClaudeChineseCompanion"

# Test-only command seams let the behavioral test drive controlled WindowServer
# states. Normal verification always uses the absolute macOS system tools.
pgrep_bin=${VERIFY_SINGLE_OVERLAY_PGREP_BIN:-/usr/bin/pgrep}
swift_bin=${VERIFY_SINGLE_OVERLAY_SWIFT_BIN:-/usr/bin/swift}

companion_pid=$("$pgrep_bin" -f -x "$executable" | /usr/bin/head -n 1 || true)
[[ -n "$companion_pid" ]] || {
  print -u2 "Claude Chinese Companion is not running."
  exit 2
}

frontmost_bundle=$("$swift_bin" -e '
  import AppKit
  print(NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "")
')
[[ "$frontmost_bundle" == "com.anthropic.claudefordesktop" ]] || {
  print -u2 "Official Claude must be frontmost before overlay verification."
  exit 3
}

panel_count=$("$swift_bin" -e '
  import Foundation
  import CoreGraphics

  let targetPID = Int(CommandLine.arguments[1])!
  let windows = CGWindowListCopyWindowInfo(
      [.optionOnScreenOnly, .excludeDesktopElements],
      kCGNullWindowID
  ) as? [[String: Any]] ?? []
  let count = windows.filter { info in
      let ownerPID = (info[kCGWindowOwnerPID as String] as? NSNumber)?.intValue
      let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue
      let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 0
      let bounds = info[kCGWindowBounds as String] as? [String: Any] ?? [:]
      let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0
      let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0
      return ownerPID == targetPID && layer == 3 && alpha > 0 && width > 0 && height > 0
  }.count
  print(count)
' "$companion_pid")
[[ "$panel_count" == "1" ]] || {
  print -u2 "Expected one visible overlay panel, found $panel_count"
  exit 1
}
print "Verified one visible click-through overlay panel for companion pid $companion_pid."
