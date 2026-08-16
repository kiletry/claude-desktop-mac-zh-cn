#!/bin/zsh
set -euo pipefail

app_path=${1:?Usage: verify-companion-window.zsh '/path/to/Claude Chinese Companion.app'}
executable="$app_path/Contents/MacOS/ClaudeChineseCompanion"
script_dir=${0:A:h}
window_filter="$script_dir/count-visible-windows.swift"

if [[ ! -x "$executable" ]]; then
  print -u2 "Companion executable not found: $executable"
  exit 2
fi

"$executable" &
companion_pid=$!
trap 'kill "$companion_pid" 2>/dev/null || true' EXIT

for _ in {1..20}; do
  sleep 0.1
  if [[ -n "${VERIFY_WINDOWSERVER_FIXTURE:-}" && ! -f "$VERIFY_WINDOWSERVER_FIXTURE" ]]; then
    continue
  fi
  filter_args=(--pid "$companion_pid" --layer 0)
  if [[ -n "${VERIFY_WINDOWSERVER_FIXTURE:-}" ]]; then
    filter_args=(--fixture "$VERIFY_WINDOWSERVER_FIXTURE" $filter_args)
  fi
  window_count=$("$window_filter" $filter_args 2>/dev/null || print 0)
  if [[ "$window_count" == "1" ]]; then
    print "Companion guidance window is visible (pid: $companion_pid)."
    exit 0
  fi
done

print -u2 "Companion launched but did not create a visible guidance window (pid: $companion_pid)."
exit 1
