import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const verifier = join(projectRoot, 'scripts', 'verify-single-overlay.zsh');
const windowVerifier = join(projectRoot, 'scripts', 'verify-companion-window.zsh');
const windowFilter = join(projectRoot, 'scripts', 'count-visible-windows.swift');

async function writeWindowFixture(root, name, windows) {
  const fixture = join(root, name);
  await writeFile(fixture, `${JSON.stringify(windows)}\n`);
  return fixture;
}

async function makeControlledVerifierState() {
  const root = await mkdtemp(join(tmpdir(), 'claude-overlay-verifier-'));
  const appPath = join(root, 'Claude Chinese Companion.app');
  const executable = join(appPath, 'Contents', 'MacOS', 'ClaudeChineseCompanion');
  const pgrep = join(root, 'pgrep');

  await mkdir(join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(executable, '#!/bin/zsh\nexit 0\n');
  await writeFile(pgrep, '#!/bin/zsh\n[[ -n "${FAKE_COMPANION_PIDS:-}" ]] && print -r -- "$FAKE_COMPANION_PIDS"\n');
  await Promise.all([executable, pgrep].map((path) => chmod(path, 0o755)));

  return { root, appPath, pgrep };
}

function runVerifier(state, values = {}) {
  return spawnSync(verifier, [state.appPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_SINGLE_OVERLAY_PGREP_BIN: state.pgrep,
      ...values,
    },
  });
}

test('window filter counts only on-screen visible bounded layer-3 windows for the target owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-window-filter-'));
  const fixture = await writeWindowFixture(root, 'windows.json', [
    { kCGWindowOwnerPID: 9999, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 160, Height: 30 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 0, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 160, Height: 30 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: false, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 160, Height: 30 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 0, kCGWindowBounds: { Width: 160, Height: 30 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 0, Height: 30 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 160, Height: 0 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 160, Height: 30 } },
  ]);

  const result = spawnSync(windowFilter, ['--fixture', fixture, '--pid', '4242', '--layer', '3'], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '1');
});

test('window filter distinguishes the layer-0 guidance window from layer-3 overlays', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-window-filter-'));
  const fixture = await writeWindowFixture(root, 'windows.json', [
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 0, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 430, Height: 190 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 1200, Height: 900 } },
  ]);

  const guidance = spawnSync(windowFilter, ['--fixture', fixture, '--pid', '4242', '--layer', '0'], { encoding: 'utf8' });
  const overlay = spawnSync(windowFilter, ['--fixture', fixture, '--pid', '4242', '--layer', '3'], { encoding: 'utf8' });

  assert.equal(guidance.status, 0);
  assert.equal(guidance.stdout.trim(), '1');
  assert.equal(overlay.status, 0);
  assert.equal(overlay.stdout.trim(), '1');
});

test('window filter can count visible overlays across multiple explicitly supplied PIDs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-window-filter-'));
  const fixture = await writeWindowFixture(root, 'windows.json', [
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 1200, Height: 900 } },
    { kCGWindowOwnerPID: 4343, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 1000, Height: 700 } },
  ]);

  const result = spawnSync(
    windowFilter,
    ['--fixture', fixture, '--pid', '4242', '--pid', '4343', '--layer', '3'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), '2');
});

test('single-overlay verifier rejects an absent companion process', async () => {
  const state = await makeControlledVerifierState();
  const result = runVerifier(state);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Claude Chinese Companion is not running/);
});

test('single-overlay verifier rejects multiple matching companion processes', async () => {
  const state = await makeControlledVerifierState();
  const result = runVerifier(state, { FAKE_COMPANION_PIDS: '4242\n4343' });

  assert.equal(result.status, 4);
  assert.match(result.stderr, /Expected exactly one running Claude Chinese Companion process, found 2/);
});

test('single-overlay verifier rejects verification while Claude is not frontmost', async () => {
  const state = await makeControlledVerifierState();
  const result = runVerifier(state, {
    FAKE_COMPANION_PIDS: '4242',
    VERIFY_SINGLE_OVERLAY_FRONTMOST_BUNDLE: 'com.apple.finder',
  });

  assert.equal(result.status, 3);
  assert.match(result.stderr, /Official Claude must be frontmost/);
});

test('single-overlay verifier rejects any visible panel count other than one using the real window filter', async () => {
  const state = await makeControlledVerifierState();
  const fixture = await writeWindowFixture(state.root, 'two-overlays.json', [
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 1200, Height: 900 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 0.8, kCGWindowBounds: { Width: 1200, Height: 900 } },
  ]);
  const result = runVerifier(state, {
    FAKE_COMPANION_PIDS: '4242',
    VERIFY_SINGLE_OVERLAY_FRONTMOST_BUNDLE: 'com.anthropic.claudefordesktop',
    VERIFY_WINDOWSERVER_FIXTURE: fixture,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Expected one visible overlay panel, found 2/);
});

test('single-overlay verifier accepts one visible layer-3 panel using the real window filter', async () => {
  const state = await makeControlledVerifierState();
  const fixture = await writeWindowFixture(state.root, 'one-overlay.json', [
    { kCGWindowOwnerPID: 9999, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 500, Height: 500 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 0, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 430, Height: 190 } },
    { kCGWindowOwnerPID: 4242, kCGWindowLayer: 3, kCGWindowIsOnscreen: true, kCGWindowAlpha: 1, kCGWindowBounds: { Width: 1200, Height: 900 } },
  ]);
  const result = runVerifier(state, {
    FAKE_COMPANION_PIDS: '4242',
    VERIFY_SINGLE_OVERLAY_FRONTMOST_BUNDLE: 'com.anthropic.claudefordesktop',
    VERIFY_WINDOWSERVER_FIXTURE: fixture,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Verified one visible layer-3 overlay panel for companion pid 4242/);
  assert.doesNotMatch(result.stdout, /click-through/);
});

test('companion-window verifier uses the real window filter for the visible guidance window', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-window-verifier-'));
  const appPath = join(root, 'Claude Chinese Companion.app');
  const executable = join(appPath, 'Contents', 'MacOS', 'ClaudeChineseCompanion');
  const fixture = join(root, 'windows.json');
  await mkdir(join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(
    executable,
    '#!/bin/zsh\nprint -r -- "[{\\"kCGWindowOwnerPID\\": $$, \\"kCGWindowLayer\\": 0, \\"kCGWindowIsOnscreen\\": true, \\"kCGWindowAlpha\\": 1, \\"kCGWindowBounds\\": {\\"Width\\": 430, \\"Height\\": 190}}]" > "$FAKE_WINDOW_FIXTURE"\nsleep 1\n',
  );
  await chmod(executable, 0o755);

  const result = spawnSync(windowVerifier, [appPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_WINDOW_FIXTURE: fixture,
      VERIFY_WINDOWSERVER_FIXTURE: fixture,
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Companion guidance window is visible/);
});
