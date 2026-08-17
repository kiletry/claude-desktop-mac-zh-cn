# Claude Desktop Localized Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independently signed `Claude 中文.app` from the installed official bundle and compatible upstream Chinese JSON data.

**Architecture:** Node modules select and validate upstream JSON data, copy a verified official bundle, apply a guarded locale-registration patch only in the copy, update the copied display name, and ad-hoc sign it. The CLI exposes a `build-localized-clone` command and never mutates `/Applications/Claude.app`.

**Tech Stack:** Node.js ESM, `node:test`, macOS `ditto`, `plutil`, `codesign`, and GitHub JSON APIs.

## Global Constraints

- Never write inside `/Applications/Claude.app`.
- Download JSON data only from `ICERainbow666/claude-desktop-zh-cn`.
- Use exact source version first, otherwise nearest lower source version.
- Reject zero or multiple locale-registry patch targets.
- Install only source resources with a verified destination in the macOS bundle;
  record absent optional destinations in the clone manifest.
- Change `CFBundleName` and `CFBundleDisplayName` only in the copied plist.
- Sign only the clone using `codesign --force --deep --sign -`.

---

### Task 1: Translation selection and guarded clone patching

**Files:**
- Create: `src/localized-clone.mjs`
- Create: `test/localized-clone.test.mjs`

- [ ] Write a failing test for choosing `1.30096.1.0` for installed
  `1.30096.5`, validating all three upstream JSON objects, mapping renderer
  and dynamic resources into an installed macOS layout, recording the absent
  desktop-shell destination, and inserting `"zh-CN"` once into the exact
  `Bc=["en-US",..."id-ID"]` array.
- [ ] Run `node --test test/localized-clone.test.mjs` and observe failure.
- [ ] Implement pure version selection, JSON validation, destination mapping,
  one-target registry patching, copied `Info.plist` display-name editing, and
  clone-manifest validation. The patch function must accept one asset string
  and return a new string; it must throw when the locale array occurs zero or
  more than once.
- [ ] Re-run the focused test and commit the green implementation.

### Task 2: Copy, signing, and CLI composition

**Files:**
- Modify: `src/cli.mjs`, `src/companion.mjs`
- Modify: `test/cli.test.mjs`

- [ ] Write a failing CLI test proving `build-localized-clone` validates the
  official bundle, calls copy and clone-only signing, writes the cloned plist
  and resources, and re-inspects the official bundle before and after.
- [ ] Run the focused test and observe failure.
- [ ] Implement the command with injected filesystem, process, and network
  dependencies, with a default clone destination of `/Applications/Claude 中文.app`.
  Build into a temporary sibling directory, rename atomically only after the
  clone signature verifies, and refuse to overwrite an existing clone unless
  `--replace` is explicitly provided.
- [ ] Re-run focused tests and commit the green implementation.

### Task 3: Real-bundle build and UI acceptance

**Files:**
- Modify: `README.md`

- [ ] Build the clone from the installed official app and source version chosen
  from the GitHub catalog, while capturing the selected source commit and
  installed/skipped resource destinations in a manifest.
- [ ] Verify `codesign --verify --deep --strict` for the clone and both
  `codesign --verify --deep --strict` and `spctl --assess --type execute` for
  the untouched official app before and after construction.
- [ ] Launch the clone, set its language preference to `zh-CN` through the
  cloned app's visible settings or launch configuration, and inspect the
  sidebar, settings, menus, dialogs, and dynamic labels for Chinese text.
  Verify that chat content and user-created names remain functionally intact.
- [ ] Document first-run login, rebuild-after-update, replacement behavior,
  local-signature limitations, and upstream attribution in `README.md`, then
  run `npm test`, `npm run package`, and `git diff --check`.
