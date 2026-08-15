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

test('update and restore reject legacy patching before mutation is called', async () => {
  for (const command of ['update', 'restore']) {
    await assert.rejects(
      runCli([command], {
        applyTransaction: async () => { throw new Error('must not write'); },
      }),
      (error) => error instanceof UserError && /retired.*Claude\.app/i.test(error.message),
    );
  }
});

test('companion operation failure still performs the post-operation assessment', async () => {
  let inspections = 0;
  const trustedApp = {
    bundleId: 'com.anthropic.claudefordesktop',
    version: '1.25927.0',
    signing: { verified: true },
    gatekeeper: { accepted: true },
  };

  await assert.rejects(
    runCli(['build-companion'], {
      inspectClaudeApp: async () => {
        inspections += 1;
        return trustedApp;
      },
      buildCompanion: async () => { throw new Error('build failed'); },
    }),
    /build failed/,
  );
  assert.equal(inspections, 2);
});

test('localized clone build is retired before it can copy or re-sign Claude', async () => {
  await assert.rejects(
    runCli(['build-localized-clone'], {
      inspectClaudeApp: async () => { throw new Error('must not inspect or copy'); },
      buildLocalizedClone: async () => { throw new Error('must not copy or re-sign'); },
    }),
    (error) => error instanceof UserError && /retired.*companion/i.test(error.message),
  );
});

test('build companion receives the trusted installed Claude version', async () => {
  const trustedApp = {
    bundleId: 'com.anthropic.claudefordesktop',
    version: '1.30096.5',
    signing: { verified: true },
    gatekeeper: { accepted: true },
  };
  const builds = [];
  const output = [];
  await runCli(['build-companion', '--app-dir', '/fixture/Claude.app'], {
    inspectClaudeApp: async () => trustedApp,
    projectDir: '/fixture/project',
    outputDir: '/fixture/output',
    buildCompanion: async (options) => {
      builds.push(options);
      return { appPath: '/fixture/output/Claude Chinese Companion.app', translationVersion: '1.30096.1.0', sourceCommit: 'commit-sha' };
    },
    writeJson: (value) => output.push(value),
  });
  assert.deepEqual(builds, [{
    appDir: '/fixture/Claude.app',
    version: '1.30096.5',
    projectDir: '/fixture/project',
    outputDir: '/fixture/output',
  }]);
  assert.deepEqual(output, [{
    appPath: '/fixture/output/Claude Chinese Companion.app',
    translationVersion: '1.30096.1.0',
    sourceCommit: 'commit-sha',
  }]);
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
