#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h:h}
cd "$project_dir"
/usr/bin/swift build -c release
build_dir=$(/usr/bin/swift build -c release --show-bin-path)
smoke_dir=$(mktemp -d /tmp/claude-companion-smoke.XXXXXX)
smoke_binary="$smoke_dir/smoke-tests"
trap 'rm -rf "$smoke_dir"' EXIT

/usr/bin/swiftc \
  -I "$build_dir/Modules" \
  Tests/main.swift \
  "$build_dir"/CompanionCore.build/*.o \
  -framework CoreGraphics \
  -o "$smoke_binary"
"$smoke_binary"
