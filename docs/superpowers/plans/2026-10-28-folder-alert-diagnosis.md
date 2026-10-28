# Claude 4.29 protected-folder alert

## Cause

The clone launcher passed `--user-data-dir` and its absolute profile directory
as two separate arguments. Claude 4.29's native runtime also scans
`process.argv.slice(1)` for arguments that do not start with `-`, stats them,
and queues the first directory as a folder-open request (`Eqa` → `Oqa` →
`Aqa` in `index.chunk-C7NkbHFq.js`). The profile directory therefore entered
the folder trust flow. Its protected-path validation rejected it, producing
the alert shown in the screenshot. The native rejection is correct.

The alert's English text is hardcoded in `index.chunk-Bjj6o2rj.js`, outside
the desktop and frontend translation catalogs.

## Fix

- Pass the profile as one argument: `--user-data-dir="$USER_DATA_DIR"`.
- Translate the native alert literals while preserving the rejection branch.
- Preserve native unpacked files when repacking into paths containing commas
  or brackets: enumerate literal paths and escape unpack matcher characters.

## Verification

- Launcher execution test records one combined profile argument, with no
  standalone directory argument.
- Regression with two unpacked native files and an output directory containing
  commas and brackets failed before the packing fix and passes afterward.
- Full suite: 119 passed, 0 failed.
- Rebuilt local generator 0.1.18-preview.2; signature and embedded CLI clean
  check passed.
- Regenerated `/Applications/Claude 中文.app` using the generator's embedded
  CLI. Strict recursive signature verification passed; both ASAR header hashes,
  the enabled Electron integrity digest, and all eight native unpacked files
  were verified.
- Official app's saved Info.plist, app.asar, ion-dist.asar and executable
  SHA256 values remain unchanged.
- Started the installed clone: no internal-folder consent/error appeared.
  Its visible interface reached the Chinese login page. The signed-in Cowork
  flow has not been revalidated, and no login credentials were changed.
- No GitHub publication was performed for this preview.
