import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { buildCloneLauncherScript } from '../src/localized-clone.mjs';

const execute = promisify(execFile);
const id = '11111111-2222-4333-8444-555555555555';
const gateway = { inferenceProvider: 'gateway', inferenceCredentialKind: 'static', inferenceGatewayBaseUrl: 'https://example.invalid', inferenceGatewayApiKey: 'fixture-key', inferenceGatewayAuthScheme: 'bearer', inferenceModels: [{ id: 'fixture-model' }] };
const metadata = { appliedId: id, entries: [{ id, name: 'Fixture Gateway' }] };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'claude-gateway-launch-'));
  const profile = join(root, '中文 Profile, [local]');
  const target = `${profile}-3p`;
  await mkdir(profile);
  const launcher = join(root, 'Claude');
  const script = process.env.CLAUDE_ZH_FIXTURE_TRACE
    ? buildCloneLauncherScript().replace('migrate_gateway_profile >/dev/null 2>&1', 'migrate_gateway_profile 2>"$USER_DATA_DIR/migration-trace.log"').replace('  umask 077', '  set -x\n  umask 077')
    : buildCloneLauncherScript();
  await writeFile(launcher, script);
  await writeFile(join(root, 'Claude-bin'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARGUMENT_SNAPSHOT"\n');
  await chmod(launcher, 0o755);
  await chmod(join(root, 'Claude-bin'), 0o755);
  const launch = async () => {
    const result = await execute(launcher, ['--startup'], { env: { ...process.env, CLAUDE_DESKTOP_ZH_CN_USER_DATA_DIR: profile, ARGUMENT_SNAPSHOT: join(root, 'args.txt') } });
    if (process.env.CLAUDE_ZH_FIXTURE_TRACE && result.stderr) console.error(await readFile(join(profile, 'migration-trace.log'), 'utf8').catch(() => 'No fixture trace'));
    return result;
  };
  return { root, profile, target, launch };
}

async function writeGateway(profile, config = {}) {
  await mkdir(join(profile, 'configLibrary'), { recursive: true });
  await writeFile(join(profile, 'configLibrary', '_meta.json'), JSON.stringify(metadata));
  await writeFile(join(profile, 'configLibrary', `${id}.json`), JSON.stringify(gateway));
  await writeFile(join(profile, 'claude_desktop_config.json'), JSON.stringify(config));
}

test('launcher recovers clone-owned Gateway settings into the new third-party profile with private files and backup', async () => {
  const { root, profile, target, launch } = await fixture();
  await writeGateway(profile, { preferences: { sourceSetting: true } });
  await mkdir(target);
  const before = '{"preferences":{"destinationSetting":true}}';
  await writeFile(join(target, 'claude_desktop_config.json'), before);
  const sourceBefore = await readFile(join(profile, 'claude_desktop_config.json'), 'utf8');
  const { stdout, stderr } = await launch();
  assert.equal(stdout + stderr, '');
  assert.deepEqual(JSON.parse(await readFile(join(target, 'configLibrary', `${id}.json`))), gateway);
  assert.deepEqual(JSON.parse(await readFile(join(target, 'configLibrary', '_meta.json'))), metadata);
  assert.deepEqual(JSON.parse(await readFile(join(target, 'claude_desktop_config.json'))), { preferences: { destinationSetting: true }, deploymentMode: '3p' });
  assert.equal(await readFile(join(profile, 'claude_desktop_config.json'), 'utf8'), sourceBefore);
  assert.equal(JSON.parse(await readFile(join(target, 'config.json'))).locale, 'zh-CN');
  for (const p of ['configLibrary/_meta.json', `configLibrary/${id}.json`, 'claude_desktop_config.json']) assert.equal((await stat(join(target, p))).mode & 0o777, 0o600);
  assert.equal((await stat(join(target, 'configLibrary'))).mode & 0o777, 0o700);
  const backups = (await readdir(target)).filter(n => n.startsWith('.claude-zh-gateway-backup.'));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(join(target, backups[0], 'claude_desktop_config.json'), 'utf8'), before);
  assert.deepEqual((await readFile(join(root, 'args.txt'), 'utf8')).trim().split('\n'), [`--user-data-dir=${profile}`, '--startup']);
  await launch();
  assert.equal((await readdir(target)).filter(n => n.startsWith('.claude-zh-gateway-backup.')).length, 1);
});

test('launcher preserves an existing third-party library and explicit first-party choice', async () => {
  for (const mode of ['configured', 'source-first-party', 'target-first-party']) {
    const { profile, target, launch } = await fixture();
    await writeGateway(profile, mode === 'source-first-party' ? { deploymentMode: '1p' } : { deploymentMode: '3p' });
    await mkdir(target);
    if (mode === 'configured') await writeGateway(target, { deploymentMode: '3p', preferences: { keep: true } });
    else await writeFile(join(target, 'claude_desktop_config.json'), JSON.stringify(mode === 'source-first-party' ? { preferences: { keep: true } } : { deploymentMode: '1p' }));
    const before = await readFile(join(target, 'claude_desktop_config.json'), 'utf8');
    await launch();
    assert.equal(await readFile(join(target, 'claude_desktop_config.json'), 'utf8'), before);
    if (mode !== 'configured') await assert.rejects(access(join(target, 'configLibrary')));
  }
});

test('launcher skips incomplete, malformed and linked Gateway sources without blocking Claude startup', async () => {
  for (const mode of ['missing-active', 'malformed-meta', 'linked-library', 'no-gateway', 'malformed-target']) {
    const { root, profile, target, launch } = await fixture();
    if (mode === 'linked-library') {
      const elsewhere = join(root, 'Other Profile');
      await writeGateway(elsewhere);
      await symlink(join(elsewhere, 'configLibrary'), join(profile, 'configLibrary'));
    } else if (mode === 'malformed-target') {
      await writeGateway(profile);
      await mkdir(target);
      await writeFile(join(target, 'claude_desktop_config.json'), '{broken');
    } else if (mode !== 'no-gateway') {
      await mkdir(join(profile, 'configLibrary'));
      await writeFile(join(profile, 'configLibrary', '_meta.json'), mode === 'malformed-meta' ? '{broken' : JSON.stringify(metadata));
    }
    const { stdout, stderr } = await launch();
    assert.ok(!(stdout + stderr).includes('fixture-key'));
    await assert.rejects(access(join(target, 'configLibrary')));
    await access(join(root, 'args.txt'));
  }
});

test('concurrent launches migrate once into a new profile and preserve source preferences', async () => {
  const { profile, target, launch } = await fixture();
  await writeGateway(profile, { deploymentMode: '3p', preferences: { sourceSetting: true } });
  await Promise.all([launch(), launch()]);
  assert.deepEqual(JSON.parse(await readFile(join(target, 'claude_desktop_config.json'))), { deploymentMode: '3p', preferences: { sourceSetting: true } });
  assert.deepEqual(JSON.parse(await readFile(join(target, 'configLibrary', '_meta.json'))), metadata);
  const contents = await readdir(target);
  assert.equal(contents.some(n => n.includes('gateway-stage.')), false);
  assert.equal((await stat(target)).mode & 0o777, 0o700);
});

test('failed desktop config publication does not leave a library that prevents retry', async () => {
  const { root, profile, target } = await fixture();
  await writeGateway(profile, { deploymentMode: '3p' });
  const mover = join(root, 'mv-fixture');
  await writeFile(mover, '#!/bin/sh\nfor arg in "$@"; do\ncase "$arg" in */claude_desktop_config.json) if [ "${FAIL_DESKTOP_MOVE:-}" = 1 ]; then exit 1; fi ;; esac\ndone\nexec /bin/mv "$@"\n');
  await chmod(mover, 0o755);
  const launcher = join(root, 'Claude');
  await writeFile(launcher, buildCloneLauncherScript().replaceAll('/bin/mv', `'${mover}'`));
  const env = { ...process.env, CLAUDE_DESKTOP_ZH_CN_USER_DATA_DIR: profile, ARGUMENT_SNAPSHOT: join(root, 'args.txt') };
  await execute(launcher, [], { env: { ...env, FAIL_DESKTOP_MOVE: '1' } });
  await access(join(root, 'args.txt'));
  await assert.rejects(access(join(target, 'configLibrary')));
  await execute(launcher, [], { env });
  assert.deepEqual(JSON.parse(await readFile(join(target, 'configLibrary', '_meta.json'))), metadata);
  assert.equal(JSON.parse(await readFile(join(target, 'claude_desktop_config.json'))).deploymentMode, '3p');
});

test('migrates Gateway with an empty or missing desktop preferences file', async () => {
  const { unlink } = await import('node:fs/promises');
  for (const empty of [true, false]) {
    const { profile, target, launch } = await fixture();
    await writeGateway(profile, {});
    if (!empty) await unlink(join(profile, 'claude_desktop_config.json'));
    await launch();
    assert.equal(JSON.parse(await readFile(join(target, 'claude_desktop_config.json'))).deploymentMode, '3p');
    assert.deepEqual(JSON.parse(await readFile(join(target, 'configLibrary', '_meta.json'))), metadata);
  }
});

test('a lock file left by an exited process does not prevent migration', async () => {
  const { profile, target, launch } = await fixture();
  await writeGateway(profile, { deploymentMode: '3p' });
  await mkdir(target);
  await writeFile(join(target, '.claude-zh-gateway-migration.lock'), '999999\n', { mode: 0o600 });
  await launch();
  assert.deepEqual(JSON.parse(await readFile(join(target, 'configLibrary', '_meta.json'))), metadata);
});

test('migration recovers stale locks and serializes launches when lockf is unavailable', async () => {
  const { root, profile, target, launch } = await fixture();
  await writeGateway(profile, { deploymentMode: '3p' });
  await mkdir(target);
  await writeFile(join(target, '.claude-zh-gateway-migration.lock'), '999999\n');
  await writeFile(join(root, 'Claude'), buildCloneLauncherScript().replace('[ -x /usr/bin/lockf ]', 'false'));
  await Promise.all([launch(), launch()]);
  assert.deepEqual(JSON.parse(await readFile(join(target, 'configLibrary', '_meta.json'))), metadata);
  assert.equal((await readdir(target)).some(n => n.includes('gateway-stage.')), false);
});
