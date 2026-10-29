// Runs with macOS system tools, so launching the clone needs no host Node runtime.
// Only the clone's own old profile is eligible; existing third-party settings win.
export const GATEWAY_PROFILE_COMPATIBILITY_SCRIPT = String.raw`
migrate_gateway_profile() (
  umask 077
  source_library="$USER_DATA_DIR/configLibrary"
  target_profile="$USER_DATA_DIR-3p"
  target_library="$target_profile/configLibrary"
  source_desktop="$USER_DATA_DIR/claude_desktop_config.json"
  target_desktop="$target_profile/claude_desktop_config.json"
  [ -d "$source_library" ] && [ ! -L "$USER_DATA_DIR" ] && [ ! -L "$source_library" ] || return 0
  [ ! -e "$target_library" ] && [ ! -L "$target_library" ] && [ ! -L "$target_profile" ] || return 0
  [ -z "$(/usr/bin/find "$source_library" -type l -print -quit)" ] || return 0
  active_id=$(/usr/bin/plutil -extract appliedId raw -o - -- "$source_library/_meta.json" 2>/dev/null) || return 0
  printf '%s\n' "$active_id" | /usr/bin/grep -Eq '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' || return 0
  active_config="$source_library/$active_id.json"
  provider=$(/usr/bin/plutil -extract inferenceProvider raw -o - -- "$active_config" 2>/dev/null) || return 0
  [ "$provider" = gateway ] || return 0
  gateway_url=$(/usr/bin/plutil -extract inferenceGatewayBaseUrl raw -o - -- "$active_config" 2>/dev/null) || return 0
  [ -n "$gateway_url" ] || return 0
  # Keep explicit first-party choices and malformed user files untouched.
  for desktop in "$source_desktop" "$target_desktop"; do
    [ ! -L "$desktop" ] || return 0
    if [ -e "$desktop" ]; then
      /usr/bin/plutil -convert json -o /dev/null -- "$desktop" >/dev/null 2>&1 || return 0
      mode=$(/usr/bin/plutil -extract deploymentMode raw -o - -- "$desktop" 2>/dev/null) || mode=''
      case "$mode" in ''|3p) ;; *) return 0 ;; esac
    fi
  done
  /bin/mkdir -p "$target_profile" || return 1
  lock="$target_profile/.claude-zh-gateway-migration.lock"
  [ ! -L "$lock" ] && [ ! -d "$lock" ] || return 1
  # Use the file-and-command interface available on older macOS releases.
  # Keeping the inode serializes concurrent runs; the kernel releases dead locks.
  /usr/bin/lockf -ks -t 5 "$lock" /bin/sh -s -- "$source_library" "$target_profile" "$source_desktop" <<'CLAUDE_ZH_GATEWAY_MIGRATE'
  set -eu
  umask 077
  source_library="$1"
  target_profile="$2"
  source_desktop="$3"
  target_library="$target_profile/configLibrary"
  target_desktop="$target_profile/claude_desktop_config.json"
  stage=''
  trap '[ -z "$stage" ] || /bin/rm -rf "$stage"' EXIT
  [ ! -e "$target_library" ] && [ ! -L "$target_library" ] || exit 0
  stage=$(/usr/bin/mktemp -d "$target_profile/.claude-zh-gateway-stage.XXXXXX") || exit 1
  /usr/bin/ditto "$source_library" "$stage/configLibrary" || exit 1
  /bin/chmod 700 "$stage/configLibrary" || exit 1
  /usr/bin/find "$stage/configLibrary" -type d -exec /bin/chmod 700 {} + || exit 1
  /usr/bin/find "$stage/configLibrary" -type f -exec /bin/chmod 600 {} + || exit 1
  if [ -f "$target_desktop" ]; then
    /bin/cp "$target_desktop" "$stage/claude_desktop_config.json" || exit 1
    backup=$(/usr/bin/mktemp -d "$target_profile/.claude-zh-gateway-backup.XXXXXX") || exit 1
    /bin/cp "$target_desktop" "$backup/claude_desktop_config.json" || exit 1
    /bin/chmod 600 "$backup/claude_desktop_config.json" || exit 1
  elif [ -f "$source_desktop" ]; then
    /bin/cp "$source_desktop" "$stage/claude_desktop_config.json" || exit 1
  else
    printf '{}\n' > "$stage/claude_desktop_config.json" || exit 1
  fi
  # Empty JSON objects also parse as OpenStep; use unambiguous XML while editing.
  /usr/bin/plutil -convert xml1 -- "$stage/claude_desktop_config.json" || exit 1
  /usr/bin/plutil -replace deploymentMode -string 3p -- "$stage/claude_desktop_config.json" || exit 1
  /usr/bin/plutil -convert json -- "$stage/claude_desktop_config.json" || exit 1
  /bin/chmod 600 "$stage/claude_desktop_config.json" || exit 1
  /bin/mv -f "$stage/claude_desktop_config.json" "$target_desktop" || exit 1
  # Publish the library last: its presence is the completion marker. An earlier
  # failed write leaves the old library absent so a later launch can retry.
  /bin/mv "$stage/configLibrary" "$target_library" || exit 1
CLAUDE_ZH_GATEWAY_MIGRATE
)
if ! migrate_gateway_profile >/dev/null 2>&1; then
  printf '%s\n' 'Gateway configuration migration could not finish; existing settings were retained.' >&2
fi
`;
