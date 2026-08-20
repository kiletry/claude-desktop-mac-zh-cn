import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runCli, runGeneratorCommand } from '../src/cli.mjs';
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

test('localized clone build validates the official app before and after clone construction', async () => {
  let inspections = 0;
  const builds = [];
  const output = [];
  const trustedApp = {
    bundleId: 'com.anthropic.claudefordesktop',
    version: '1.30096.5',
    signing: { verified: true },
    gatekeeper: { accepted: true },
  };

  await runCli(['build-localized-clone', '--app-dir', '/fixture/Claude.app', '--output-dir', '/fixture/output', '--replace'], {
    inspectClaudeApp: async () => {
      inspections += 1;
      return trustedApp;
    },
    buildLocalizedClone: async (options) => {
      builds.push(options);
      return {
        appPath: '/fixture/output/Claude 中文.app',
        translationVersion: '1.30096.1.0',
        sourceCommit: 'commit-sha',
      };
    },
    writeJson: (value) => output.push(value),
  });

  assert.equal(inspections, 2);
  assert.deepEqual(builds, [{
    appDir: '/fixture/Claude.app',
    version: '1.30096.5',
    outputDir: '/fixture/output',
    replace: true,
  }]);
  assert.deepEqual(output, [{
    appPath: '/fixture/output/Claude 中文.app',
    translationVersion: '1.30096.1.0',
    sourceCommit: 'commit-sha',
  }]);
});

test('generate is the public Claude.app to Claude Chinese.app generator command', async () => {
  const builds = [];
  const output = [];
  const trustedApp = {
    bundleId: 'com.anthropic.claudefordesktop',
    version: '1.30096.5',
    signing: { verified: true },
    gatekeeper: { accepted: true },
  };

  await runCli(['generate', '--app-dir', '/fixture/Claude.app', '--output-dir', '/fixture/output', '--replace'], {
    inspectClaudeApp: async () => trustedApp,
    buildLocalizedClone: async (options) => {
      builds.push(options);
      return { appPath: '/fixture/output/Claude 中文.app', translationVersion: '1.30096.1.0', sourceCommit: 'commit-sha' };
    },
    writeJson: (value) => output.push(value),
  });

  assert.deepEqual(builds, [{
    appDir: '/fixture/Claude.app',
    version: '1.30096.5',
    outputDir: '/fixture/output',
    replace: true,
  }]);
  assert.deepEqual(output, [{
    appPath: '/fixture/output/Claude 中文.app',
    translationVersion: '1.30096.1.0',
    sourceCommit: 'commit-sha',
  }]);
});

test('Accessibility companion build receives the trusted installed Claude version', async () => {
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

test('normal CLI output remains unchanged without json events', async () => {
  const output = [];
  await runCli(['generate', '--app-dir', '/fixture/Claude.app'], {
    inspectClaudeApp: async () => ({
      bundleId: 'com.anthropic.claudefordesktop', version: '1.30096.5',
      signing: { verified: true }, gatekeeper: { accepted: true },
    }),
    buildLocalizedClone: async () => ({
      appPath: '/fixture/output/Claude 中文.app', translationVersion: '1.0', sourceCommit: 'sha',
    }),
    writeJson: (value) => output.push(value),
    write: () => { throw new Error('JSON mode leaked to write'); },
  });
  assert.deepEqual(output, [{ appPath: '/fixture/output/Claude 中文.app', translationVersion: '1.0', sourceCommit: 'sha' }]);
});

test('json events report a redacted inspection lifecycle', async () => {
  const lines = [];
  await runCli(['status', '--json-events', '--app-dir', '/fixture/Claude.app'], {
    write: (line) => lines.push(line),
    inspectClaudeApp: async () => ({
      bundleId: 'com.anthropic.claudefordesktop',
      version: '1.30096.5',
      signing: { verified: true, output: 'apiKey=sk-secret' },
      gatekeeper: { accepted: true, output: 'Bearer secret' },
    }),
  });
  const events = lines.map((line) => JSON.parse(line));
  assert.deepEqual(events.map((event) => event.event), ['inspection_started', 'inspection_succeeded']);
  assert.equal(events.some((event) => JSON.stringify(event).includes('sk-')), false);
});

test('json generation events expose ordered stages and trust failures', async () => {
  const lines = [];
  await assert.rejects(
    runCli(['generate', '--json-events', '--app-dir', '/fixture/Claude.app'], {
      write: (line) => lines.push(line),
      inspectClaudeApp: async () => ({
        bundleId: 'com.anthropic.claudefordesktop',
        version: '1.30096.5',
        signing: { verified: false, output: 'apiKey=sk-secret' },
        gatekeeper: { accepted: false, output: 'Bearer secret' },
      }),
    }),
    /must pass codesign and Gatekeeper/,
  );
  const events = lines.map((line) => JSON.parse(line));
  assert.equal(events.at(-1).event, 'error');
  assert.notEqual(events.at(-1).value, 0);
  assert.equal(events.some((event) => JSON.stringify(event).includes('sk-')), false);

  const successLines = [];
  await runCli(['generate', '--json-events', '--app-dir', '/fixture/Claude.app'], {
    write: (line) => successLines.push(line),
    inspectClaudeApp: async () => ({
      bundleId: 'com.anthropic.claudefordesktop',
      version: '1.30096.5',
      signing: { verified: true },
      gatekeeper: { accepted: true },
    }),
    buildLocalizedClone: async () => ({ appPath: '/fixture/output/Claude 中文.app' }),
  });
  const successEvents = successLines.map((line) => JSON.parse(line));
  assert.deepEqual(
    successEvents.filter((event) => event.stage).map((event) => event.stage),
    ['inspection', 'inspection', 'generation', 'generation', 'verify', 'verify', 'completed'],
  );
});

test('json generation does not claim later stages after an early operation failure', async () => {
  const lines = [];
  await assert.rejects(runCli(['generate', '--json-events'], {
    write: (line) => lines.push(line),
    inspectClaudeApp: async () => ({
      bundleId: 'com.anthropic.claudefordesktop', version: '1.0',
      signing: { verified: true }, gatekeeper: { accepted: true },
    }),
    buildLocalizedClone: async () => { throw new Error('copy failed with token=secret'); },
  }), /copy failed/);
  const events = lines.map((line) => JSON.parse(line));
  assert.deepEqual(events.map(({ event, stage }) => [event, stage]), [
    ['inspection_started', 'inspection'], ['inspection_succeeded', 'inspection'],
    ['stage_started', 'generation'], ['error', 'generation'],
  ]);
  assert.equal(events.some((event) => event.event === 'completed'), false);
  assert.equal(events.some((event) => JSON.stringify(event).includes('secret')), false);
});

test('final trust failure emits a redacted error before completed', async () => {
  const lines = [];
  let inspections = 0;
  await assert.rejects(runCli(['generate', '--json-events'], {
    write: (line) => lines.push(line),
    inspectClaudeApp: async () => {
      inspections += 1;
      return inspections === 1
        ? { bundleId: 'com.anthropic.claudefordesktop', version: '1.0', signing: { verified: true }, gatekeeper: { accepted: true } }
        : { bundleId: 'com.anthropic.claudefordesktop', version: '1.0', signing: { verified: false, output: 'apiKey=sk-final' }, gatekeeper: { accepted: false, output: 'Bearer final' } };
    },
    buildLocalizedClone: async () => ({ appPath: '/fixture/output/Claude 中文.app' }),
  }), /must pass codesign/);
  const events = lines.map((line) => JSON.parse(line));
  assert.equal(events.at(-1).event, 'error');
  assert.equal(events.at(-1).stage, 'verify');
  assert.equal(events.some((event) => event.event === 'completed'), false);
  assert.equal(events.some((event) => JSON.stringify(event).includes('sk-')), false);
  assert.equal(events.findIndex((event) => event.event === 'stage_started' && event.stage === 'verify') < events.length - 1, true);
});

test('runGeneratorCommand captures the bridge process contract', async () => {
  const calls = [];
  const result = await runGeneratorCommand(['status', '--json-events'], {
    cwd: '/fixture/workdir',
    env: { GENERATOR_TEST: '1' },
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      const listeners = {};
      const stdout = { on: (event, listener) => { listeners[`stdout:${event}`] = listener; } };
      const stderr = { on: (event, listener) => { listeners[`stderr:${event}`] = listener; } };
      process.nextTick(() => {
        listeners['stdout:data']?.('{"event":"completed"}\n');
        listeners.close?.(0);
      });
      return {
        stdout,
        stderr,
        once: (event, listener) => { listeners[event] = listener; },
        emit(event, value) { listeners[event]?.(value); },
      };
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, '{"event":"completed"}\n');
  assert.equal(result.stderr, '');
  assert.equal(calls[0].command, process.execPath);
  assert.deepEqual(calls[0].args.slice(-2), ['status', '--json-events']);
  assert.equal(calls[0].options.cwd, '/fixture/workdir');
  assert.equal(calls[0].options.env.GENERATOR_TEST, '1');
});
