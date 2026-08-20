#!/bin/zsh
set -euo pipefail

usage() {
  print -u2 -- "Usage: verify-generator-bundle.sh '/path/Claude 中文生成器.app'"
  exit 64
}

fail() {
  print -u2 -- "$1"
  exit 1
}

(( $# == 1 )) || usage
app_path="$1"
[[ -d "$app_path" ]] || fail "Generator app does not exist: $app_path"
[[ "${app_path:t}" == 'Claude 中文生成器.app' ]] || fail "Refusing to verify a non-generator app: $app_path"

contents="$app_path/Contents"
resources="$contents/Resources"
runtime="$resources/runtime"
plist="$contents/Info.plist"

for forbidden in 'Claude.app' 'Claude 中文.app'; do
  if find "$app_path" \( -type d -o -type l \) -name "$forbidden" -print -quit | grep -q .; then
    fail "Generator bundle must not embed $forbidden"
  fi
done

[[ -f "$plist" ]] || fail "Generator bundle is missing Info.plist"
for runtime_binary in node-arm64 node-x64; do
  [[ -x "$runtime/$runtime_binary" ]] || fail "Missing required embedded runtime: $runtime/$runtime_binary"
done

cli="$runtime/package/bin/claude-desktop-mac-zh-cn.mjs"
[[ -f "$cli" ]] || fail "Missing embedded CLI entrypoint: $cli"

plistbuddy_bin="${PLISTBUDDY_BIN:-/usr/libexec/PlistBuddy}"
bundle_id="$("$plistbuddy_bin" -c 'Print :CFBundleIdentifier' "$plist")"
[[ "$bundle_id" == 'com.kiletry.claude-desktop-mac-zh-cn-generator' ]] || fail "Unexpected generator bundle ID: $bundle_id"

codesign_bin="${CODESIGN_BIN:-/usr/bin/codesign}"
signature_info="$("$codesign_bin" -dv --verbose=4 "$app_path" 2>&1)" || fail "Generator app signature cannot be inspected"
[[ "$signature_info" == *'Signature=adhoc'* ]] || fail "Generator app must use a valid ad-hoc signature"
"$codesign_bin" --verify --deep --strict --verbose=2 "$app_path" || fail "Generator app ad-hoc signature verification failed"

case "$(uname -m)" in
  arm64) node="$runtime/node-arm64" ;;
  x86_64) node="$runtime/node-x64" ;;
  *) fail "Unsupported verification architecture: $(uname -m)" ;;
esac
"$node" "$cli" --help >/dev/null || fail "Embedded CLI help command failed"

print -- "Verified generator bundle: $app_path"
