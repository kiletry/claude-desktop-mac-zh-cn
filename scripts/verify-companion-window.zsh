#!/bin/zsh
set -euo pipefail

app_path=${1:?Usage: verify-companion-window.zsh '/path/to/Claude Chinese Companion.app'}
executable="$app_path/Contents/MacOS/ClaudeChineseCompanion"

if [[ ! -x "$executable" ]]; then
  print -u2 "Companion executable not found: $executable"
  exit 2
fi

"$executable" &
companion_pid=$!
trap 'kill "$companion_pid" 2>/dev/null || true' EXIT

for _ in {1..20}; do
  sleep 0.1
  if /usr/bin/swift -e '
    import AppKit
    let targetPID = Int(CommandLine.arguments[1])!
    let windowInfo = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
    let hasVisibleWindow = windowInfo.contains { info in
      (info[kCGWindowOwnerPID as String] as? Int) == targetPID &&
      (info[kCGWindowLayer as String] as? Int) == 0
    }
    exit(hasVisibleWindow ? 0 : 1)
  ' "$companion_pid"; then
    print "Companion window is visible (pid: $companion_pid)."
    exit 0
  fi
done

print -u2 "Companion launched but did not create a visible window (pid: $companion_pid)."
exit 1
