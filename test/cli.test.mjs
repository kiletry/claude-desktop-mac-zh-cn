import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runCli } from '../src/cli.mjs';
import { CompatibilityError, PermissionError, UserError, asExitCode } from '../src/errors.mjs';

test('help exposes only the safe public commands', async () => {
  const output = [];
  await runCli(['--help'], { write: (line) => output.push(line) });
  assert.match(output.join('\n'), /status.*build-companion.*launch-companion/s);
  assert.doesNotMatch(output.join('\n'), /\b(?:install|update|restore)\b/);
});

test('unknown commands reject with a user error', async () => {
  await assert.rejects(
    runCli(['unknown'], { write: () => {} }),
    (error) => error instanceof UserError && error.exitCode === 2,
  );
});

test('install rejects legacy patching before mutation is called', async () => {
  await assert.rejects(
    runCli(['install'], {
      applyTransaction: async () => { throw new Error('must not write'); },
    }),
    (error) => error instanceof UserError && /retired.*Claude\.app/i.test(error.message),
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

test('status is read-only and reports the Claude assessment', async () => {
  const output = [];
  let writes = 0;
  const { runCli: cli } = await import('../src/cli.mjs');
  await cli(['status', '--app-dir', '/fixture/Claude.app'], {
    writeJson: (value) => output.push(value),
    inspectClaudeApp: async () => ({
      bundleId: 'com.anthropic.claudefordesktop',
      version: '1.25927.0',
      signing: { verified: true },
      gatekeeper: { accepted: true },
    }),
    applyTransaction: async () => { writes += 1; },
    write: () => { writes += 1; },
  });
  assert.equal(output[0].gatekeeper.accepted, true);
  assert.equal(writes, 0);
});
