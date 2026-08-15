# Claude Desktop macOS Simplified Chinese Companion

This project is transitioning from its former resource patcher to a separate,
offline macOS companion. It never modifies, re-signs, changes permissions, or
removes attributes in `/Applications/Claude.app`.

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

`build-companion` reads the installed Claude version, downloads the nearest
compatible translation data from the credited GitHub project, and pairs it
with the installed app's English message keys. The resulting OCR dictionary is
packaged inside the separate companion application. It makes no runtime
network requests.

When you turn it on, macOS asks you to allow **Screen Recording** for `Claude
中文伴侣`. Recognition happens locally with Apple's Vision framework. The
companion only displays translated overlays in the left 30% of the Claude
window (sidebar) and top 14% (toolbar). The central chat, prompt box,
attachments, and transcripts do not receive an overlay. No screen text is
sent, stored, or translated by a cloud service.

After building, open the generated `dist/Claude Chinese Companion.app`, grant
Screen Recording in **System Settings → Privacy & Security → Screen Recording**,
then use **Claude 中文 → 启用中文界面** in the macOS menu bar. If Claude is
updated later, run `./install.sh build-companion` again before launching the
new companion bundle.

## Attribution

The prior translation data referenced
[ICERainbow666/claude-desktop-zh-cn](https://github.com/ICERainbow666/claude-desktop-zh-cn).
感谢 `ICERainbow666/claude-desktop-zh-cn` 的作者及维护者提供翻译数据。
This project is independent and is not affiliated with Anthropic.

## Development

```bash
npm test
npm pack --dry-run
```

Tests use a synthetic Claude.app directory and never modify the installed
application.
