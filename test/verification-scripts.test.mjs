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

async function makeControlledVerifierState() {
  const root = await mkdtemp(join(tmpdir(), 'claude-overlay-verifier-'));
  const appPath = join(root, 'Claude Chinese Companion.app');
  const executable = join(appPath, 'Contents', 'MacOS', 'ClaudeChineseCompanion');
  const pgrep = join(root, 'pgrep');
  const swift = join(root, 'swift');

  await mkdir(join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(executable, '#!/bin/zsh\nexit 0\n');
  await writeFile(pgrep, '#!/bin/zsh\n[[ -n "${FAKE_COMPANION_PID:-}" ]] && print -r -- "$FAKE_COMPANION_PID"\n');
  await writeFile(swift, '#!/bin/zsh\nif [[ "$*" == *frontmostApplication* ]]; then\n  print -r -- "${FAKE_FRONTMOST_BUNDLE:-}"\nelse\n  print -r -- "${FAKE_PANEL_COUNT:-0}"\nfi\n');
  await Promise.all([executable, pgrep, swift].map((path) => chmod(path, 0o755)));

  return { appPath, pgrep, swift };
}

function runVerifier(state, values = {}) {
  return spawnSync(verifier, [state.appPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_SINGLE_OVERLAY_PGREP_BIN: state.pgrep,
      VERIFY_SINGLE_OVERLAY_SWIFT_BIN: state.swift,
      ...values,
    },
  });
}

test('single-overlay verifier rejects an absent companion process', async () => {
  const state = await makeControlledVerifierState();
  const result = runVerifier(state);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Claude Chinese Companion is not running/);
});

test('single-overlay verifier rejects verification while Claude is not frontmost', async () => {
  const state = await makeControlledVerifierState();
  const result = runVerifier(state, {
    FAKE_COMPANION_PID: '4242',
    FAKE_FRONTMOST_BUNDLE: 'com.apple.finder',
  });

  assert.equal(result.status, 3);
  assert.match(result.stderr, /Official Claude must be frontmost/);
});

test('single-overlay verifier rejects any visible panel count other than one', async () => {
  const state = await makeControlledVerifierState();
  const result = runVerifier(state, {
    FAKE_COMPANION_PID: '4242',
    FAKE_FRONTMOST_BUNDLE: 'com.anthropic.claudefordesktop',
    FAKE_PANEL_COUNT: '2',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Expected one visible overlay panel, found 2/);
});

test('single-overlay verifier accepts exactly one visible panel for frontmost Claude', async () => {
  const state = await makeControlledVerifierState();
  const result = runVerifier(state, {
    FAKE_COMPANION_PID: '4242',
    FAKE_FRONTMOST_BUNDLE: 'com.anthropic.claudefordesktop',
    FAKE_PANEL_COUNT: '1',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Verified one visible click-through overlay panel for companion pid 4242/);
});

test('companion-window verifier reports the visible guidance window separately from the overlay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-window-verifier-'));
  const appPath = join(root, 'Claude Chinese Companion.app');
  const executable = join(appPath, 'Contents', 'MacOS', 'ClaudeChineseCompanion');
  const swift = join(root, 'swift');
  await mkdir(join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(executable, '#!/bin/zsh\nsleep 1\n');
  await writeFile(swift, '#!/bin/zsh\nexit 0\n');
  await Promise.all([executable, swift].map((path) => chmod(path, 0o755)));

  const result = spawnSync(windowVerifier, [appPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      VERIFY_COMPANION_WINDOW_SWIFT_BIN: swift,
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Companion guidance window is visible/);
});
