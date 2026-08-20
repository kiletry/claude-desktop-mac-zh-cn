#!/bin/zsh
set -euo pipefail

usage() {
  print -u2 -- "Usage: build-dmg.sh --app '/path/Claude 中文生成器.app' --output '/path/Claude 中文生成器-macOS.dmg'"
  exit 64
}

fail() {
  print -u2 -- "$1"
  exit 1
}

app_path=''
output_path=''
while (( $# > 0 )); do
  case "$1" in
    --app) (( $# >= 2 )) || usage; app_path="$2"; shift 2 ;;
    --output) (( $# >= 2 )) || usage; output_path="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) print -u2 -- "Unknown option: $1"; usage ;;
  esac
done

[[ -n "$app_path" && -n "$output_path" ]] || usage
[[ -d "$app_path" ]] || fail "Generator app does not exist: $app_path"
[[ "${app_path:t}" == 'Claude 中文生成器.app' ]] || fail "Refusing to package a non-generator app: $app_path"
[[ ! -e "$output_path" || -f "$output_path" ]] || fail "DMG output path is not a file: $output_path"

output_dir="${output_path:h}"
mkdir -p "$output_dir"

# The generator is the only app we sign here.  Official Claude is never an input
# to this script and is never copied, signed, or otherwise modified.
codesign_bin="${CODESIGN_BIN:-/usr/bin/codesign}"
"$codesign_bin" --force --deep --sign - "$app_path"

staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/claude-chinese-generator-dmg.XXXXXX")"
cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT HUP INT TERM

cp -R "$app_path" "$staging_dir/Claude 中文生成器.app"
ln -s /Applications "$staging_dir/Applications"

# hdiutil create produces the final image directly; it does not attach a volume,
# so there is no mounted image to detach.  This keeps failed builds from leaving
# a mounted writable volume behind.
hdiutil_bin="${HDIUTIL_BIN:-/usr/bin/hdiutil}"
"$hdiutil_bin" create \
  -volname 'Claude 中文生成器' \
  -srcfolder "$staging_dir" \
  -ov \
  -format UDZO \
  "$output_path"

[[ -f "$output_path" ]] || fail "DMG creation did not produce an output file: $output_path"
print -- "$output_path"
