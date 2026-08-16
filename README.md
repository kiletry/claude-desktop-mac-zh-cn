# Claude Desktop macOS Simplified Chinese Companion

This project provides a separate, offline macOS companion. It never modifies,
copies, re-signs, changes permissions, removes attributes, or writes any file
inside `/Applications/Claude.app`.

The legacy `install`, `update`, `restore`, and Chinese-clone commands are
retired because changing, copying, or re-signing the official app is not a
reliable way to modify an Electron application. The command line interface
only exposes `status`, `build-companion`, and `launch-companion`.

## Safety checks

`status` reads the Claude bundle identifier, version, code-signature status,
and Gatekeeper assessment. Only the official
`com.anthropic.claudefordesktop` bundle is supported. Companion build and
launch operations require both `codesign --verify --deep --strict` and
`spctl --assess --type execute` to pass before and after the operation.

```bash
./install.sh status --app-dir /Applications/Claude.app
./install.sh build-companion
./install.sh launch-companion
```

## How the companion works

`build-companion` automatically reads the installed Claude version, checks the
latest GitHub `master` commit from the credited translation project, selects
the nearest compatible versioned translation set, and pairs it with the
installed app's English message keys. The resulting local translation
dictionary is packaged inside the separate companion application. Network
access happens only while rebuilding the dictionary; the running companion
makes no network requests.

When you turn it on, macOS asks you to allow **Accessibility** for `Claude
中文伴侣`. The companion reads only approved static Claude sidebar and toolbar
control metadata, translates it with the packaged local dictionary, and draws
all accepted labels in one transparent, click-through overlay surface per
Claude window. The central chat, prompt box, attachments, transcripts,
conversation titles, and user information are rejected before text lookup.
No interface text is sent, persisted, logged, or translated by a cloud
service. The companion does not request or use Screen Recording.

After building, open the generated `dist/Claude Chinese Companion.app`. On the
first launch, grant **Accessibility** in **系统设置 → 隐私与安全性 → 辅助功能**
for **Claude 中文伴侣**, quit the companion, and open it once more. Then use
**Claude 中文 → 启用中文界面** in the macOS menu bar.

Local builds use the stable designated requirement
`identifier "com.kiletry.claude-chinese-companion"`, so macOS can associate a
replacement build with the same Accessibility permission. If Claude is
updated, run `./install.sh build-companion` again to refresh the dictionary for
the newly installed Claude version, replace only the companion bundle, and
relaunch it. Never replace or alter `/Applications/Claude.app`.

## Acceptance verification

With official Claude frontmost and translation enabled, verify the companion's
one-surface invariant with:

```bash
scripts/verify-single-overlay.zsh '/Applications/Claude Chinese Companion.app'
```

The verifier requires exactly one visible layer-3 companion panel. The
companion's visible guidance window is checked separately by
`scripts/verify-companion-window.zsh`; it is not counted as the overlay.

## Attribution

特别感谢
[ICERainbow666/claude-desktop-zh-cn](https://github.com/ICERainbow666/claude-desktop-zh-cn)
的作者及维护者持续提供和维护简体中文翻译数据。
This project is independent and is not affiliated with Anthropic.

## Development

```bash
npm test
npm run package
cd companion-macos && swift build -c release && Tests/run-smoke-tests.zsh
```

Tests use a synthetic Claude.app directory and never modify the installed
application.
