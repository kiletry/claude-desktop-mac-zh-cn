# Claude Desktop macOS Chinese Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `claude-desktop-mac-zh-cn`, a dependency-free Node.js installer that fetches upstream Chinese translation JSON, detects Claude Desktop, and applies a reversible macOS resource patch.

**Architecture:** Pure modules handle version selection, GitHub data, bundle inspection, locale patch planning, transactions, and preferences. The CLI composes them into read-only `status`, transactional `install`/`update`, and drift-safe `restore`. Tests use a synthetic `.app`; the real app is used only for `status` and `--dry-run`.

**Tech Stack:** Node.js 18+ ESM, `node:test`, Node built-ins, POSIX shell, GitHub REST API, macOS `plutil` and `codesign`.

## Global Constraints

- Support `/Applications/Claude.app` and explicit `--app-dir`.
- Download only JSON data from `ICERainbow666/claude-desktop-zh-cn`; never run or clone upstream scripts.
- Exact translation match is default; nearest fallback requires `--allow-nearest`.
- Use Node.js 18+ with no runtime dependencies.
- `status` and `--dry-run` never write or terminate processes.
- A real install requires `--accept-signature-risk`; never re-sign Claude, bypass Gatekeeper, disable SIP, or change ACLs.
- Every mutation has a backup, source commit, and SHA-256 digest. Restore rejects files that drifted after installation.
- README and `NOTICE` thank the upstream project and clarify no Anthropic affiliation.

## File Structure

- `package.json`, `bin/claude-desktop-mac-zh-cn.mjs`, `install.sh`: package and executable entry points.
- `src/errors.mjs`, `src/version.mjs`, `src/upstream.mjs`: errors, version selection, GitHub JSON client.
- `src/claude-inspector.mjs`, `src/locale-patch.mjs`: bundle discovery and guarded patch planning.
- `src/transaction.mjs`, `src/preferences.mjs`: backup, atomic write, restore, and local locale preferences.
- `src/cli.mjs`: status/install/update/restore composition.
- `test/fixtures/claude-app/` and `test/*.test.mjs`: isolated fixtures and tests.
- `README.md`, `NOTICE`: documentation and source attribution.

---

### Task 1: Package foundation and CLI boundary

**Files:**
- Create: `package.json`, `.gitignore`, `bin/claude-desktop-mac-zh-cn.mjs`
- Create: `src/errors.mjs`, `src/cli.mjs`, `test/cli.test.mjs`

**Interfaces:**
- `runCli(argv, dependencies) -> Promise<number>`.
- `UserError`, `CompatibilityError`, `PermissionError`, and `asExitCode(error)`.

- [ ] **Step 1: Write the failing command test**

```js
test('help exposes all public commands', async () => {
  const output = [];
  await runCli(['--help'], { write: (line) => output.push(line) });
  assert.match(output.join('\n'), /status.*install.*update.*restore/s);
});
```

- [ ] **Step 2: Verify RED**

Run `npm test -- --test-name-pattern='help exposes'`. Expected: `runCli` is missing.

- [ ] **Step 3: Implement the minimum shell**

Add ESM metadata, Node `>=18`, `node --test`, bin mapping, typed errors,
help output, and unknown-command rejection. No resource mutation is permitted.

- [ ] **Step 4: Verify GREEN and commit**

Run `npm test -- --test-name-pattern='help exposes'`, then commit as
`chore: initialize macOS installer package`.

---

### Task 2: Version and upstream translation data

**Files:**
- Create: `src/version.mjs`, `src/upstream.mjs`
- Create: `test/version.test.mjs`, `test/upstream.test.mjs`

**Interfaces:**
- `normalizeClaudeVersion(input) -> { upstream, parts }`.
- `compareVersions(left, right) -> -1 | 0 | 1`.
- `selectTranslationVersion(appVersion, versions, { allowNearest }) -> { version, exact, relation }`.
- `fetchUpstreamCatalog({ fetchImpl, owner, repo, ref }) -> { commit, versions }`.
- `downloadTranslation({ fetchImpl, commit, version }) -> { files, digests }`.
- `validateTranslationJson(value, sourcePath) -> object`.

- [ ] **Step 1: Write failing version tests**

```js
assert.throws(
  () => selectTranslationVersion('1.30097.0', ['1.30096.1.0'], { allowNearest: false }),
  CompatibilityError,
);
assert.equal(
  selectTranslationVersion('1.30097.0', ['1.30096.1.0'], { allowNearest: true }).version,
  '1.30096.1.0',
);
```

- [ ] **Step 2: Verify RED**

Run `npm test -- --test-name-pattern='version|translation'`. Expected: missing exports.

- [ ] **Step 3: Implement numeric version logic**

Normalize `1.25927.0` to `1.25927.0.0`. Compare numeric tuples rather than
strings, return exact-selection metadata, and use only the highest compatible
lower version when `--allow-nearest` was explicit.

- [ ] **Step 4: Write failing upstream tests and implement JSON-only client**

Inject `fetchImpl` responses for a commit, `translated-zh-CN` listing, and JSON
files. Require object roots and string values; record source commit and
SHA-256. Use GitHub HTTP APIs only, never shell execution or `git clone`.

- [ ] **Step 5: Verify GREEN and commit**

Run `npm test -- --test-name-pattern='version|translation|upstream'`, then
commit as `feat: select and validate upstream translation versions`.

---

### Task 3: Claude.app inspection and guarded locale planning

**Files:**
- Create: `src/claude-inspector.mjs`, `src/locale-patch.mjs`
- Create: `test/inspector.test.mjs`, `test/locale-patch.test.mjs`
- Create: `test/fixtures/claude-app/Contents/Info.plist`
- Create: `test/fixtures/claude-app/Contents/Resources/ion-dist/i18n/en-US.json`
- Create: `test/fixtures/claude-app/Contents/Resources/ion-dist/assets/v1/app.js`

**Interfaces:**
- `inspectClaudeApp(appDir, { execFile }) -> { appDir, resourcesDir, version, layout, signing }`.
- `planLocaleRegistryPatch(jsText) -> { changed, text, kind }`.
- `planResourceDestinations(resourcesDir, upstreamFiles) -> [{ sourceKey, destination }]`.
- `buildPatchPlan(appInfo, selected, files) -> { fileWrites, registryPatches, warnings }`.

- [ ] **Step 1: Write failing inspector tests**

Use an injectable `plutil` invocation. Require `Contents/Resources/ion-dist/i18n`
and assert an explicit invalid `--app-dir` raises `CompatibilityError` rather
than falling back to `/Applications/Claude.app`.

- [ ] **Step 2: Verify RED**

Run `npm test -- --test-name-pattern='inspector'`. Expected: module missing.

- [ ] **Step 3: Implement app inspection**

Read `CFBundleShortVersionString`, discover actual resource paths, and capture
`codesign --verify --deep --strict` for status. Do not modify signing state.

- [ ] **Step 4: Write failing locale tests**

Fixture JavaScript includes one known locale array and map. Assert exactly one
`zh-CN` insertion, idempotence, and rejection for zero or multiple candidates.
Assert desktop-shell/dynamic files are planned only if matching local paths exist.

- [ ] **Step 5: Implement guarded patch planning**

Preserve all unmodified bytes. Require exactly one known locale target, and do
not add blanket replacements for hard-coded English text.

- [ ] **Step 6: Verify GREEN and commit**

Run `npm test -- --test-name-pattern='inspector|locale'`, then commit as
`feat: inspect Claude bundles and plan guarded locale patches`.

---

### Task 4: Reversible transaction and preference planning

**Files:**
- Create: `src/transaction.mjs`, `src/preferences.mjs`
- Create: `test/transaction.test.mjs`, `test/preferences.test.mjs`

**Interfaces:**
- `createBackup({ backupRoot, operationId, fileWrites, metadata }) -> manifest`.
- `applyTransaction({ plan, manifest, dryRun }) -> { manifest, changedFiles }`.
- `restoreTransaction(manifest, { currentDigest }) -> void`.
- `findPreferenceFiles(homeDir, { fs }) -> string[]`.
- `updateLocalePreference(rawJson, locale) -> string`.

- [ ] **Step 1: Write failing transaction tests**

Use a temp fixture. Assert original/replacement SHA-256 values are saved, a
simulated second-write failure rolls back the first, writes are temp-file plus
rename, and restore refuses a changed target digest.

- [ ] **Step 2: Verify RED**

Run `npm test -- --test-name-pattern='transaction'`. Expected: module missing.

- [ ] **Step 3: Implement backup and restore**

Store backups at `~/Library/Application Support/Claude Desktop zh-CN/backups/<timestamp>/`.
Use `fs.copyFile`, SHA-256, temp writes in the destination directory, and
rename. Roll back only paths recorded by the current operation.

- [ ] **Step 4: Write failing preference tests and implement updates**

Test supported existing configuration paths, unrelated-field preservation,
insertion of `locale: "zh-CN"`, and invalid-JSON rejection. Return a write plan;
do not create unknown preference files or clear caches.

- [ ] **Step 5: Verify GREEN and commit**

Run `npm test -- --test-name-pattern='transaction|preference'`, then commit as
`feat: add reversible resources and locale preferences`.

---

### Task 5: CLI commands and POSIX deployment entry point

**Files:**
- Modify: `src/cli.mjs`, `bin/claude-desktop-mac-zh-cn.mjs`, `test/cli.test.mjs`
- Create: `install.sh`

**Interfaces:**
- `status` reports app version, signing, upstream match, current locale, and backup count.
- `install`/`update` require `--accept-signature-risk` except in dry-run.
- `restore` validates a selected manifest before its first write.

- [ ] **Step 1: Write failing command-boundary tests**

Mock all effects. Assert status does no writes, dry-run creates no backup and
does not terminate Claude, missing risk acknowledgement is a `UserError`, and
drifted restore writes nothing.

- [ ] **Step 2: Verify RED**

Run `npm test -- --test-name-pattern='status|install|restore|dry-run'`.
Expected: command composition fails.

- [ ] **Step 3: Implement command composition**

Inject filesystem, process, network, and prompt effects. Finalize and display
the plan before asking Claude to quit. Keep update as install against a newly
detected version. `install.sh` uses `set -eu`, validates Node >=18, then execs
the local bin file without `sudo` or downloads.

- [ ] **Step 4: Verify GREEN and commit**

Run `npm test -- --test-name-pattern='status|install|restore|dry-run'`, then
commit as `feat: add reversible macOS installer commands`.

---

### Task 6: Integration fixture, README, and attribution

**Files:**
- Create: `test/integration.test.mjs`, `README.md`, `NOTICE`
- Modify: `package.json`

**Interfaces:**
- The integration test composes production modules on a synthetic `.app`.
- README covers command use, risks, backups, upgrades, and source credit.

- [ ] **Step 1: Write failing integration test**

Create a temporary app at `1.25927.0` with a single registry target and exact
mock source. Assert dry-run is byte-for-byte unchanged; install writes only
planned resources and locale; restore returns all fixture bytes to original.

- [ ] **Step 2: Verify RED then implement fixture integration**

Run `npm test -- --test-name-pattern='integration'`. Add isolated temp
fixtures with no network, process termination, or writes outside the fixture.
Run the same command again. Expected: PASS.

- [ ] **Step 3: Write documentation and NOTICE**

Document `status`, `install --dry-run`, `install --accept-signature-risk`,
`--allow-nearest`, `restore`, and reinstall after a Claude update. Explain
signature risk and explicitly thank/link
`ICERainbow666/claude-desktop-zh-cn` for translation data; state this project
independently implements macOS deployment logic.

- [ ] **Step 4: Add source-only package check and commit**

Add a `package` script based on `npm pack --dry-run`; it must exclude Claude
binaries, user data, backups, and copied upstream translations. Run `npm test`
and `npm pack --dry-run`, then commit as
`docs: add macOS usage and upstream attribution`.

---

### Task 7: Verify the upgraded Claude installation and publish GitHub

**Files:**
- Modify source/tests only after a fixture-first reproduction of a real dry-run layout mismatch.

- [ ] **Step 1: Inspect without writes**

Run `node bin/claude-desktop-mac-zh-cn.mjs status --app-dir /Applications/Claude.app`.
Expected: app version, signing, layout, backups, and translation match with no modification.

- [ ] **Step 2: Run real dry-run**

Run `node bin/claude-desktop-mac-zh-cn.mjs install --app-dir /Applications/Claude.app --dry-run`.
Expected: planned paths and warning only; no backup and no process termination.

- [ ] **Step 3: Fix mismatches fixture-first**

For a changed current layout, first add the smallest failing fixture and test,
then narrow discovery/patch logic, run `npm test`, and rerun the real dry-run.

- [ ] **Step 4: Final verification**

Run `git diff --check`, scan tracked source for credential patterns, run
`npm test`, and run `npm pack --dry-run`. Capture exit codes before claiming success.

- [ ] **Step 5: Create and push the requested GitHub repository**

After GitHub authentication is available, create public repository
`claude-desktop-mac-zh-cn` without an auto-generated README, push `main`, and
verify its README retains the upstream attribution.
