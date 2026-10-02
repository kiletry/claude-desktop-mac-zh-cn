import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CompatibilityError } from '../src/errors.mjs';
import { inspectClaudeApp } from '../src/claude-inspector.mjs';

async function makeApp() {
  const root = await mkdtemp(join(tmpdir(), 'claude-inspector-'));
  const appDir = join(root, 'Claude.app');
  await mkdir(join(appDir, 'Contents', 'Resources', 'ion-dist', 'i18n'), { recursive: true });
  await mkdir(join(appDir, 'Contents', 'Resources', 'ion-dist', 'assets', 'v1'), { recursive: true });
  await writeFile(join(appDir, 'Contents', 'Info.plist'), 'fixture');
  return appDir;
}

test('inspects required resource directories and version', async () => {
  const appDir = await makeApp();
  const info = await inspectClaudeApp(appDir, {
    execFile: async () => ({
      stdout: JSON.stringify({
        CFBundleIdentifier: 'com.anthropic.claudefordesktop',
        CFBundleShortVersionString: '1.25927.0',
      }),
      stderr: '',
    }),
  });
  assert.equal(info.version, '1.25927.0');
  assert.equal(info.layout.i18nDir.endsWith('/ion-dist/i18n'), true);
  assert.equal(info.layout.assetsDir.endsWith('/ion-dist/assets/v1'), true);
});

test('reports official bundle and Gatekeeper assessment', async () => {
  const appDir = await makeApp();
  const fakeMacCommand = async (file) => {
    if (file === '/usr/bin/plutil') {
      return {
        stdout: JSON.stringify({
          CFBundleIdentifier: 'com.anthropic.claudefordesktop',
          CFBundleShortVersionString: '1.25927.0',
        }),
        stderr: '',
      };
    }
    return { stdout: '', stderr: '' };
  };

  const result = await inspectClaudeApp(appDir, { execFile: fakeMacCommand });
  assert.equal(result.bundleId, 'com.anthropic.claudefordesktop');
  assert.equal(result.signing.verified, true);
  assert.equal(result.gatekeeper.accepted, true);
});

test('reports ad-hoc signing separately from official Developer ID signing', async () => {
  const appDir = await makeApp();
  const result = await inspectClaudeApp(appDir, {
    execFile: async (file, args) => {
      if (file === '/usr/bin/plutil') return { stdout: JSON.stringify({
        CFBundleIdentifier: 'com.anthropic.claudefordesktop',
        CFBundleShortVersionString: '2.19675.0',
      }), stderr: '' };
      if (file === '/usr/bin/codesign' && args[0] === '-dvvv') return {
        stdout: '', stderr: 'Identifier=com.anthropic.claudefordesktop\nSignature=adhoc\nTeamIdentifier=not set\n',
      };
      return { stdout: '', stderr: '' };
    },
  });
  assert.equal(result.signing.teamIdentifier, null);
  assert.equal(result.signing.officialDeveloperId, false);
});

test('rejects an explicit invalid app directory', async () => {
  await assert.rejects(
    inspectClaudeApp('/missing/Claude.app', { execFile: async () => ({}) }),
    CompatibilityError,
  );
});
