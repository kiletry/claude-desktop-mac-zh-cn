#!/bin/zsh
set -euo pipefail

usage() {
  print -u2 -- "Usage: verify-generator-bundle.sh [--clean-check] '/path/Claude 中文生成器.app'"
  exit 64
}

fail() {
  print -u2 -- "$1"
  exit 1
}

clean_check=false
if [[ "${1:-}" == '--clean-check' ]]; then
  clean_check=true
  shift
fi

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

if [[ "$clean_check" == true ]]; then
  clean_root="$(mktemp -d "${TMPDIR:-/tmp}/claude-generator-clean-check.XXXXXX")"
  trap 'rm -rf "$clean_root"' EXIT
  clean_home="$clean_root/home"
  clean_output="$clean_root/output"
  official_app="${VERIFY_GENERATOR_CLEAN_APP_DIR:-$clean_root/Claude.app}"
  mkdir -p "$clean_home" "$clean_output"

  if [[ -z "${VERIFY_GENERATOR_CLEAN_APP_DIR:-}" ]]; then
    mkdir -p "$official_app/Contents/Resources/ion-dist/i18n"
    cat > "$official_app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.anthropic.claudefordesktop</string>
<key>CFBundleShortVersionString</key><string>clean-check-fixture</string>
</dict></plist>
EOF
  fi

  [[ -d "$official_app" ]] || fail "Clean-check official app fixture does not exist: $official_app"
  before_snapshot="$clean_root/official-before.sha256"
  after_snapshot="$clean_root/official-after.sha256"
  find "$official_app" -xdev -type f -exec shasum -a 256 {} + | LC_ALL=C sort > "$before_snapshot"

  clean_env=(HOME="$clean_home" TMPDIR="$clean_root/tmp" PATH='/usr/bin:/bin:/usr/sbin:/sbin')
  if [[ -n "${CLEAN_CHECK_HOST_NODE:-}" ]]; then
    # Test fixtures may use a tiny embedded-runtime launcher; release bundles never need this.
    clean_env+=(CLEAN_CHECK_HOST_NODE="$CLEAN_CHECK_HOST_NODE")
  fi
  mkdir -p "$clean_root/tmp"
  clean_node="$node"
  clean_cli="$cli"
  if [[ "$clean_node" != /* ]]; then clean_node="$PWD/$clean_node"; fi
  if [[ "$clean_cli" != /* ]]; then clean_cli="$PWD/$clean_cli"; fi
  (
    cd "$clean_root"
    env -i "${clean_env[@]}" "$clean_node" "$clean_cli" status --app-dir "$official_app" >/dev/null
  ) || fail "Embedded CLI status path failed during clean-machine check"

  find "$official_app" -xdev -type f -exec shasum -a 256 {} + | LC_ALL=C sort > "$after_snapshot"
  cmp -s "$before_snapshot" "$after_snapshot" || fail "Clean check detected a write under the official Claude fixture"
  [[ -z "$(find "$clean_output" -mindepth 1 -print -quit)" ]] || fail "Clean check unexpectedly created clone output"

  print -- "Verified embedded CLI status path without host Node or project files"
  print -- "Quality gate passed"
fi
