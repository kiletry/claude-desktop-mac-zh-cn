#!/bin/zsh
set -euo pipefail

app_path=${1:?Usage: verify-single-overlay.zsh '/Applications/Claude Chinese Companion.app'}
executable="$app_path/Contents/MacOS/ClaudeChineseCompanion"
script_dir=${0:A:h}
window_filter="$script_dir/count-visible-windows.swift"

# Test-only process/frontmost seams drive verifier branches; visible-window
# counts still run through the same Swift filter used for live WindowServer data.
pgrep_bin=${VERIFY_SINGLE_OVERLAY_PGREP_BIN:-/usr/bin/pgrep}

pgrep_output=$("$pgrep_bin" -f -x "$executable" || true)
[[ -n "$pgrep_output" ]] || {
  print -u2 "Claude Chinese Companion is not running."
  exit 2
}
companion_pids=("${(@f)pgrep_output}")
if (( ${#companion_pids} != 1 )); then
  print -u2 "Expected exactly one running Claude Chinese Companion process, found ${#companion_pids}."
  exit 4
fi
companion_pid=$companion_pids[1]

if [[ -n "${VERIFY_SINGLE_OVERLAY_FRONTMOST_BUNDLE+x}" ]]; then
  frontmost_bundle=$VERIFY_SINGLE_OVERLAY_FRONTMOST_BUNDLE
else
  frontmost_bundle=$(/usr/bin/swift -e '
    import AppKit
    print(NSWorkspace.shared.frontmostApplication?.bundleIdentifier ?? "")
  ')
fi
[[ "$frontmost_bundle" == "com.anthropic.claudefordesktop" ]] || {
  print -u2 "Official Claude must be frontmost before overlay verification."
  exit 3
}

filter_args=(--pid "$companion_pid" --layer 3)
if [[ -n "${VERIFY_WINDOWSERVER_FIXTURE:-}" ]]; then
  filter_args=(--fixture "$VERIFY_WINDOWSERVER_FIXTURE" $filter_args)
fi
panel_count=$("$window_filter" $filter_args)
[[ "$panel_count" == "1" ]] || {
  print -u2 "Expected one visible overlay panel, found $panel_count"
  exit 1
}
print "Verified one visible layer-3 overlay panel for companion pid $companion_pid."
