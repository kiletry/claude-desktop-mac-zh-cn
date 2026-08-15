# Claude Desktop macOS Simplified Chinese Companion

This project is transitioning from its former resource patcher to a separate,
offline macOS companion. It never modifies, re-signs, changes permissions, or
removes attributes in `/Applications/Claude.app`.

The legacy `install`, `update`, and `restore` commands are retired because
replacing Claude resources invalidates its signed application bundle. The
command line interface only exposes `status`, `build-companion`, and
`launch-companion`.

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

The eventual companion uses a bundled local dictionary and will make no
runtime network requests. It is designed to translate only application chrome;
it does not transmit, persist, or translate chats, prompts, attachments, or
transcripts.

## Attribution

The prior translation data referenced
[ICERainbow666/claude-desktop-zh-cn](https://github.com/ICERainbow666/claude-desktop-zh-cn).
This project is independent and is not affiliated with Anthropic.

## Development

```bash
npm test
npm pack --dry-run
```

Tests use a synthetic Claude.app directory and never modify the installed
application.
