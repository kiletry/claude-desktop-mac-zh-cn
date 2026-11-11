#!/bin/sh
# Runs independently after the generator exits. All paths arrive as arguments.
set -eu
umask 077
[ "$#" -ge 7 ] && [ "$#" -le 9 ] || exit 64
parent_pid=$1
target=$2
staged=$3
old_version=$4
new_version=$5
receipt=$6
wait_seconds=$7
relaunch=${8:-no}
ready=${9:-$receipt.ready}
case "$parent_pid:$wait_seconds" in *[!0-9:]*|:*|*:) exit 64 ;; esac
[ "$wait_seconds" -le 120 ] || exit 64
[ "${target##*/}" = 'Claude 中文生成器.app' ] || exit 64
[ "${staged%/*}" = "${target%/*}" ] || exit 64
case "${staged##*/}" in .claude-generator-update-*.app) ;; *) exit 64 ;; esac
[ "$target" != "$staged" ] && [ ! -L "$target" ] && [ ! -L "$staged" ] || exit 64
[ -d "$target" ] && [ -d "$staged" ] || exit 64
backup="$staged.previous"
[ ! -e "$backup" ] && [ ! -L "$backup" ] || exit 64
lock="${target%/*}/.claude-generator-install.lock"
# File-and-command mode is available on the minimum supported macOS 13.
# Keep the inode for concurrent launchers; ownership ends with the transaction.
if [ "${CLAUDE_GENERATOR_UPDATE_LOCKED:-}" != yes ]; then
    export CLAUDE_GENERATOR_UPDATE_LOCKED=yes
    exec /usr/bin/lockf -k -s -t 0 "$lock" /bin/sh "$0" "$@"
fi
finish() {
    status=$?
    trap - EXIT HUP INT TERM
    if [ "$status" -ne 0 ] && [ -d "$backup" ] && [ ! -L "$backup" ]; then
        if [ -d "$target" ] && [ ! -e "$staged" ]; then
            /bin/mv "$target" "$staged" || true
        fi
        if [ ! -e "$target" ] && [ -d "$backup" ]; then
            /bin/mv "$backup" "$target" || true
        fi
    fi
    if [ "$status" -ne 0 ]; then
        printf 'failed\n' > "$receipt" || true
        if [ "$relaunch" = relaunch ] && ! /bin/kill -0 "$parent_pid" 2>/dev/null; then /usr/bin/open -n "$target" || true; fi
    fi
    exit "$status"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM
validate() {
    app=$1
    version=$2
    [ ! -L "$app" ] && [ ! -L "$app/Contents" ] && [ ! -L "$app/Contents/Info.plist" ] || return 1
    [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")" = 'com.kiletry.claude-desktop-mac-zh-cn-generator' ] || return 1
    [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")" = "$version" ] || return 1
    /usr/bin/codesign --verify --deep --strict "$app"
}
validate "$target" "$old_version"
validate "$staged" "$new_version"
printf 'ready\n' > "$ready"
elapsed=0
while /bin/kill -0 "$parent_pid" 2>/dev/null; do
    [ "$elapsed" -lt "$wait_seconds" ] || exit 1
    /bin/sleep 1
    elapsed=$((elapsed + 1))
done
validate "$target" "$old_version"
validate "$staged" "$new_version"
/bin/mv "$target" "$backup"
/bin/mv "$staged" "$target"
validate "$target" "$new_version"
# Keep the prior signed generator beside the new app for manual recovery.
printf 'installed\n' > "$receipt"
if [ "$relaunch" = relaunch ]; then /usr/bin/open -n "$target"; fi
