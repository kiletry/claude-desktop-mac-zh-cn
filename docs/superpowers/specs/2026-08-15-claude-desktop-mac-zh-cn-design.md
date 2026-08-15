# Claude Desktop macOS Chinese Installer Design

## Goal

Create `claude-desktop-mac-zh-cn`, a local-first macOS installer for the
Simplified Chinese language resources maintained by
[`ICERainbow666/claude-desktop-zh-cn`](https://github.com/ICERainbow666/claude-desktop-zh-cn).

The tool targets the official Claude Desktop application. It detects the
installed application version, fetches only the matching translation JSON from
the upstream repository, registers `zh-CN` in Claude's bundled locale list,
and writes the selected locale to local configuration when that configuration
is present.

The project must not redistribute Claude Desktop, execute upstream scripts, or
silently alter an application installation.

## Scope

The first release supports macOS and an official `.app` installation at
`/Applications/Claude.app`, with an explicit `--app-dir` override. It provides
these commands:

- `status`: inspect the Claude installation, current locale, backups, and the
  latest upstream translation versions without writing files.
- `install`: make a timestamped backup, download and validate a translation
  pack, update locale assets and the guarded locale registry patch, then set
  the local preference to `zh-CN`.
- `restore`: restore an installer-created backup and remove only files and
  registry changes recorded in that backup manifest.
- `update`: rerun the version-selection and install flow after Claude Desktop
  has updated.

Every mutating command supports `--dry-run`. The first real install requires
an explicit acknowledgement that editing a signed application can invalidate
its code signature.

## Architecture

The package uses Node.js 18 or newer with no runtime dependencies. The shell
entry point only locates Node and delegates to a Node CLI.

```text
install.sh
  -> CLI command parser
       -> Claude installation inspector
       -> upstream translation client
       -> version selector
       -> backup manager
       -> guarded resource patcher
       -> local preference writer
       -> verifier and operation journal
```

### Claude installation inspector

The inspector resolves the app directory, reads
`Contents/Info.plist` for `CFBundleShortVersionString`, and verifies the
expected `Contents/Resources` structure before any mutation. It discovers
locale directories from the actual installation rather than assuming a Windows
AppX layout.

It also captures the current signing state using `codesign` before changes.
The project never re-signs Claude Desktop and never changes ownership or ACLs.

### Upstream translation client

The client queries the GitHub API for the head commit and lists available
directories under `translated-zh-CN`. It downloads only the JSON files needed
for the selected version. It does not clone, run, or source files from the
upstream repository.

The client normalizes Claude's three-part app version (for example,
`1.25927.0`) to the upstream four-part form (`1.25927.0.0`). Exact matching is
the default. A non-exact match is displayed but rejected unless the user passes
`--allow-nearest`.

Each downloaded JSON file must parse successfully, have an object root, and
contain string-valued messages. The operation journal records the Git commit,
source path, and SHA-256 digest for each file.

### Resource patcher

The patcher maps upstream data to the locale paths discovered in the local app:

- `ion-dist/zh-CN.json` supplies renderer strings.
- `desktop-shell/zh-CN.json` supplies desktop-shell strings when the matching
  locale path exists in the installed bundle.
- dynamic locale data is installed only when both the upstream version and the
  local bundle expose a compatible dynamic locale path.

The patcher registers `zh-CN` only in a JavaScript locale array or locale map
that already contains the known supported Claude locales. It requires exactly
one safe insertion target for each required registry structure. Unknown or
ambiguous bundle layouts stop the install without writing changes.

The patcher does not apply blanket replacements to minified JavaScript and
does not replace hard-coded English strings in the first release. This keeps
the blast radius small and makes restoration deterministic.

### Backup and restore

Before the first write, the installer creates
`~/Library/Application Support/Claude Desktop zh-CN/backups/<timestamp>/`.
The backup manifest lists every original file, original digest, replacement
digest, and exact byte-range or whole-file operation. Existing `zh-CN` files
are backed up rather than overwritten without a record.

`restore` only uses this manifest. It refuses to overwrite a file whose digest
does not match the one the installer previously wrote, preventing accidental
rollback over a newer Claude update or another user's modification.

### Local preference and processes

Before a write, the tool asks Claude to quit and verifies that the official
Claude process has exited. It looks for supported configuration paths under
`~/Library/Application Support/Claude*` and updates a JSON `locale` field only
when the file parses to an object. It preserves unknown configuration fields.

If no supported preference file is present, the language assets can still be
installed, but the command reports that the user must select Chinese in the UI
once it appears. Runtime caches are not deleted by default.

## Safety and error handling

- `status` and `--dry-run` never write files.
- `install` requires `--accept-signature-risk` for a real app mutation.
- The user sees the selected Claude version, source commit, source version,
  affected paths, and signing warning before confirmation.
- Writes use a temporary file in the destination directory followed by an
  atomic rename where the filesystem supports it.
- A failed install triggers rollback from the just-created backup.
- Network, schema, compatibility, permission, and signature failures report
  actionable errors and leave application resources unchanged.
- The process does not use `sudo` automatically. It explains when the caller
  needs to invoke it with appropriate privileges for `/Applications`.

Editing resources within a signed `.app` can invalidate its signature and a
Claude update will overwrite the patch. These are explicitly documented in the
README and operation output. The installer does not bypass Gatekeeper, disable
SIP, re-sign the app, or change macOS security settings.

## Attribution and licensing

The README and `NOTICE` credit
[`ICERainbow666/claude-desktop-zh-cn`](https://github.com/ICERainbow666/claude-desktop-zh-cn)
as the translation-data source. They state that this project independently
implements macOS deployment, validation, backup, and restoration logic.

The project keeps upstream translation data out of the distribution unless its
license and attribution requirements are preserved. The installer fetches
translation data from the upstream repository at runtime and records the exact
source commit. The project also states that neither repository is affiliated
with Anthropic.

## Tests and verification

Node's built-in test runner covers:

- version normalization and exact/nearest source selection;
- GitHub payload and translation JSON validation;
- Claude bundle path discovery;
- locale registry insertion and rejection of ambiguous patterns;
- backup manifests, atomic writes, rollback, and restore refusal on drift;
- preference updates that preserve unrelated JSON fields.

An integration fixture is a synthetic `Claude.app` directory. It verifies a
complete install, `status`, and restore cycle without touching the real app.

Before release, the real local Claude installation is checked with `status`
and `install --dry-run` after it has been updated. A real installation is a
separate explicit action and is not part of automated verification.

## Delivery

The GitHub repository is named `claude-desktop-mac-zh-cn`. Its initial contents
include source code, tests, `README.md`, `NOTICE`, and a release packaging
script. A GitHub repository is created and pushed only after local tests pass;
GitHub authentication is required at that point.
