#!/bin/sh
set -eu

case "$(node -p 'process.versions.node.split(".")[0]')" in
  0|1[0-7]) echo 'Node.js 18 or newer is required.' >&2; exit 1 ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$SCRIPT_DIR/bin/claude-desktop-mac-zh-cn.mjs" "$@"
