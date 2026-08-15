# Claude Desktop Offline Chinese Companion Design

## Status

Approved design. This document supersedes the earlier resource-patching
installer design. It intentionally does not modify `Claude.app`.

## Goal

Provide Simplified Chinese labels for Claude Desktop's application interface
without modifying, re-signing, or otherwise writing inside the official
`/Applications/Claude.app` bundle.

The companion translates application chrome only: menus, buttons, settings,
dialog titles, and other controls. It does not read, translate, store, or send
chat messages, prompt text, attachments, or conversation history.

## Constraints

- Claude Desktop must remain an official, signed application.
- No UI text is transmitted to a cloud service; the companion makes no runtime
  network requests.
- Translation data is a packaged local dictionary, initially derived from the
  credited `ICERainbow666/claude-desktop-zh-cn` project where compatible.
- The solution targets macOS and requires the user to grant the companion
  Accessibility permission.
- Unknown text remains in English. The companion does not collect it.

## Architecture

```text
Claude.app (unchanged, signed by Anthropic)
       |
       | macOS Accessibility API: allowed UI control metadata and bounds
       v
Claude Chinese Companion.app
  |- target detector
  |- interface-only accessibility filter
  |- local dictionary matcher
  |- non-interactive overlay renderer
  `- menu-bar controller and permission guidance
```

### Native companion application

`companion-macos/` is a native macOS application. It is a menu-bar utility
that detects the official Claude bundle identifier
`com.anthropic.claudefordesktop` and attaches no code to its process.

It renders transparent, non-activating overlay panels. The panels ignore mouse
events, so Claude's original controls remain clickable. Panel positions follow
the corresponding accessibility element bounds and refresh after relevant
window, focus, layout, and menu changes.

### Accessibility scope filter

Only known application-interface roles and regions are eligible for matching,
such as menu items, buttons, labels, tabs, and settings controls. Text areas,
web-content conversation regions, message lists, attachments, and editable
prompt fields are excluded before the dictionary matcher runs.

The filter must be fail-closed: uncertain regions are not translated. A
dictionary hit alone is never sufficient to classify chat content as UI.

### Offline dictionary

The packaged dictionary maps an English string plus optional UI context to a
Simplified Chinese label. Context includes control role and a stable parent
region when accessibility metadata provides it, allowing identical strings to
have distinct translations in different parts of the interface.

The first release ships the dictionary inside the companion bundle. Updates
are delivered only through a new locally installed companion release; the
running application has no update checker or translation network client.

## User flow

1. The safe installer builds or installs the standalone companion and checks
   that `Claude.app` remains code-signature valid.
2. On first launch, the companion explains why it needs Accessibility access
   and opens the standard macOS permission location. It does not enable or
   change the permission itself.
3. Once authorized, the user enables the menu-bar toggle. The utility waits
   for an official Claude window and applies only known local-dictionary
   translations.
4. When Claude is absent, minimized, updated, or exposes an unknown interface,
   the companion shows a clear status and leaves Claude unaffected.

## Migration from the resource patcher

The existing Node installer becomes a safety-focused launcher and verifier:

- It must not write any file in `Claude.app`.
- Legacy `install`, `update`, and resource-patching operations are removed or
  replaced by commands that fail with an explanation of the signature risk.
- `status` reports Claude's signature state, companion state, Accessibility
  guidance, and any legacy-backup directory without applying a legacy restore.
- New commands only build, install, launch, or inspect the separate companion.
- Documentation states that the former resource-replacement approach is
  retired and unsafe.

The README and NOTICE retain clear attribution to
`ICERainbow666/claude-desktop-zh-cn`, describe the independent macOS companion
implementation, and state that neither project is affiliated with Anthropic.

## Error handling

- Missing Accessibility permission: show exact macOS authorization guidance;
  do not attempt a workaround.
- Claude not running: show an inactive status only.
- Unsupported Claude layout or version: leave controls in English and report
  dictionary coverage, without logging UI strings.
- Overlay failure: remove all overlay panels and preserve access to Claude.
- Companion installation failure: do not alter `Claude.app`; report its fresh
  signature verification result.

## Verification

- Unit tests cover context-aware dictionary lookup, unknown-string fallback,
  and exclusion of text areas and conversation regions.
- Unit tests cover overlay layout calculations and non-interactive panel
  configuration.
- Integration tests use a synthetic accessibility tree and prove that only
  eligible UI controls produce Chinese overlay labels.
- Build verification compiles the native companion and runs its tests.
- Installer verification asserts `codesign --verify --deep --strict` and
  `spctl --assess` both succeed for `Claude.app` before and after every
  companion operation.
- Manual acceptance verifies menus, settings, and buttons translate while a
  real chat transcript and prompt field remain untouched.

## Delivery

The repository remains `claude-desktop-mac-zh-cn`. The first delivery provides
a locally buildable macOS companion. A broadly distributable one-click package
without macOS unknown-developer warnings requires a future Apple Developer
signing and notarization workflow, which is explicitly out of scope until its
credentials and release ownership are provided.
