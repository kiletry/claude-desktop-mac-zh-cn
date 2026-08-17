# Claude Desktop Localized Clone Design

## Status

Approved on 2026-08-17. This design supersedes the external overlay for the
current Claude Desktop build: its Electron accessibility tree exposes no UI
text, so an accessibility-only overlay cannot translate its interface. The
user explicitly re-approved the independent-copy boundary and confirmed use
of the nearest compatible upstream translation for the installed build.

## Goal

Provide a separate macOS application, named `Claude 中文.app`, with the Claude
Desktop interface rendered in Simplified Chinese while keeping the official
`/Applications/Claude.app` byte-for-byte untouched and notarized.

## Design

The installer reads the installed Claude version and obtains only the three
JSON translation resources from the credited upstream repository. It chooses
an exact translation version when present, otherwise the closest lower version
and records that choice. For the current installed `1.30096.5` build, the
selected upstream set is `1.30096.1.0` at commit
`131e680744a5df705964b5eec2c0e0b04de68217`. It copies the official bundle to a
new destination, writes `zh-CN` resources only inside that copy, adds `zh-CN`
to the one verified locale registry array, then signs the whole copied bundle
with a local ad-hoc signature. The current macOS bundle exposes renderer and
dynamic i18n directories but no `desktop-shell/i18n` directory; the validated
desktop-shell source file is therefore recorded as skipped rather than
inventing a destination.

The copied application remains distinct from the official one and may need to
be rebuilt after a Claude update. The copy may need a one-time Claude login,
because macOS can separate credentials for a differently signed application.
The installer never changes the official bundle, its quarantine attributes,
its signature, its permissions, or its user data.

## Boundaries

- Source data is JSON only from `ICERainbow666/claude-desktop-zh-cn`.
- The translation source is selected by version, not by an arbitrary download.
- Locale JavaScript is patched only when the exact known locale array occurs
  exactly once; otherwise the copied bundle is discarded and the command fails.
- `CFBundleDisplayName` and a stable independent bundle identifier
  (`com.kiletry.claude-desktop-zh-cn`) are changed only in the copied
  `Info.plist`; the internal `CFBundleName` remains `Claude` and executable
  names remain unchanged because Electron derives helper paths from that
  internal name. A distinct identifier is required because LaunchServices
  otherwise routes the copied path back to the official app.
- `codesign --verify --deep --strict` must pass for the clone. The official
  application is checked before and after clone construction.
- The installer does not call `xattr`, disable Gatekeeper, or modify the
  official application.
- A failed copy, patch, or signature operation removes only the incomplete
  clone destination; it never rolls back by writing to the official bundle.

## Acceptance evidence

1. `/Applications/Claude.app` remains accepted by `codesign` and Gatekeeper.
2. The clone contains every compatible zh-CN resource whose destination exists
   in the installed macOS layout, exactly one locale registry insertion, and a
   manifest explaining any source resource skipped because its destination is
   absent.
3. The clone's code signature verifies after all changes.
4. On launch, the clone resolves the macOS Chinese locale and presents Claude
   controls in Chinese. A manual screenshot/UI inspection confirms this.
