import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runCli } from '../src/cli.mjs';
import { CompatibilityError, PermissionError, UserError, asExitCode } from '../src/errors.mjs';

test('help exposes all public commands', async () => {
  const output = [];
  await runCli(['--help'], { write: (line) => output.push(line) });
  assert.match(output.join('\n'), /status.*install.*update.*restore/s);
});

test('unknown commands reject with a user error', async () => {
  await assert.rejects(
    runCli(['unknown'], { write: () => {} }),
    (error) => error instanceof UserError && error.exitCode === 2,
  );
});

test('real install requires explicit signature-risk acknowledgement', async () => {
  await assert.rejects(
    runCli(['install'], {
      inspectClaudeApp: async () => ({ version: '1.25927.0', signing: { verified: true }, layout: { i18nDir: '/fixture/i18n', assetsDir: null } }),
      fetchUpstreamCatalog: async () => ({ commit: 'abc', versions: ['1.25927.0.0'], owner: 'o', repo: 'r', ref: 'master' }),
    }),
    (error) => error instanceof UserError && /accept-signature-risk/.test(error.message),
  );
});

test('typed and unknown errors map to stable nonzero exit codes', () => {
  assert.equal(asExitCode(new UserError('bad input')), 2);
  assert.equal(asExitCode(new CompatibilityError('unsupported')), 3);
  assert.equal(asExitCode(new PermissionError('denied')), 4);
  assert.equal(asExitCode(new Error('unexpected')), 1);
});

test('executable maps an unknown command to its process exit code', () => {
  const bin = fileURLToPath(new URL('../bin/claude-desktop-mac-zh-cn.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [bin, 'unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command: unknown/);
});

test('status is read-only and reports the selected translation', async () => {
  const output = [];
  let writes = 0;
  const { runCli: cli } = await import('../src/cli.mjs');
  await cli(['status', '--app-dir', '/fixture/Claude.app'], {
    writeJson: (value) => output.push(value),
    inspectClaudeApp: async () => ({ version: '1.25927.0', signing: { verified: true }, layout: { i18nDir: '/fixture/i18n', assetsDir: null } }),
    fetchUpstreamCatalog: async () => ({ commit: 'abc', versions: ['1.25927.0.0'], owner: 'o', repo: 'r', ref: 'master' }),
    applyTransaction: async () => { writes += 1; },
    write: () => { writes += 1; },
  });
  assert.equal(output[0].translation.exact, true);
  assert.equal(writes, 0);
});

test('install dry-run does not require signature acknowledgement or write', async () => {
  let applied = false;
  await runCli(['install', '--dry-run'], {
    inspectClaudeApp: async () => ({ version: '1.25927.0', signing: { verified: true }, layout: { i18nDir: '/fixture/i18n', assetsDir: null } }),
    fetchUpstreamCatalog: async () => ({ commit: 'abc', versions: ['1.25927.0.0'], owner: 'o', repo: 'r', ref: 'master' }),
    downloadTranslation: async () => ({ files: { 'ion-dist': { hello: '你好' } } }),
    findPreferenceFiles: async () => [],
    applyTransaction: async () => { applied = true; return { changedFiles: [] }; },
    writeJson: () => {},
  });
  assert.equal(applied, true);
});

test('install maps desktop-shell translations to the root locale file', async () => {
  let capturedPlan;
  await runCli(['install', '--dry-run'], {
    inspectClaudeApp: async () => ({
      version: '1.25927.0',
      resourcesDir: '/fixture/resources',
      signing: { verified: true },
      layout: { i18nDir: '/fixture/i18n', assetsDir: null },
    }),
    fetchUpstreamCatalog: async () => ({ commit: 'abc', versions: ['1.25927.0.0'], owner: 'o', repo: 'r', ref: 'master' }),
    downloadTranslation: async () => ({ files: { 'ion-dist': { hello: '你好' }, 'desktop-shell': { menu: '设置' } } }),
    findPreferenceFiles: async () => [],
    applyTransaction: async ({ plan }) => { capturedPlan = plan; return { changedFiles: [] }; },
    writeJson: () => {},
  });
  assert.ok(capturedPlan.fileWrites.some((file) => file.destination === '/fixture/resources/zh-CN.json'));
});
