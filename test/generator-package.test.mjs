import assert from 'node:assert/strict';
import { access, lstat, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildGeneratorApp } from '../scripts/build-generator-app.mjs';

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function fixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'claude-generator-package-'));
  const runtimeDir = join(rootDir, 'runtimes');
  const executable = join(rootDir, 'ClaudeChineseGenerator');
  await mkdir(join(rootDir, 'bin'), { recursive: true });
  await mkdir(join(rootDir, 'src'), { recursive: true });
  await mkdir(join(rootDir, 'node_modules', 'safe-package'), { recursive: true });
  await mkdir(join(rootDir, 'installer-macos', 'Resources'), { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(join(rootDir, 'bin', 'claude-desktop-mac-zh-cn.mjs'), '#!/usr/bin/env node\n');
  await writeFile(join(rootDir, 'src', 'cli.mjs'), 'export const safe = true;\n');
  await writeFile(join(rootDir, 'package.json'), '{"name":"fixture","version":"2.4.6"}\n');
  await writeFile(join(rootDir, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(join(rootDir, 'node_modules', 'safe-package', 'index.js'), 'export default true;\n');
  await writeFile(join(rootDir, 'installer-macos', 'Resources', 'README-first-launch.txt'), 'first launch\n');
  await writeFile(join(runtimeDir, 'node-arm64'), 'arm runtime');
  await writeFile(join(runtimeDir, 'node-x64'), 'x64 runtime');
  await writeFile(executable, '#!/bin/sh\nexit 0\n');
  return { rootDir, runtimeDir, executable, output: join(rootDir, 'Claude 中文生成器.app') };
}

test('builds an app with both embedded Node runtimes and a resource manifest', async () => {
  const paths = await fixture();
  await buildGeneratorApp({ ...paths, sourceCommit: 'abc123' });

  const resourceRoot = join(paths.output, 'Contents', 'Resources');
  const manifest = JSON.parse(await readFile(join(resourceRoot, 'runtime', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.supportedArchitectures, ['arm64', 'x64']);
  assert.equal(manifest.generatorVersion, '2.4.6');
  assert.equal(manifest.sourceCommit, 'abc123');
  assert.equal(await exists(join(resourceRoot, 'runtime', 'node-arm64')), true);
  assert.equal(await exists(join(resourceRoot, 'runtime', 'node-x64')), true);
  assert.equal(await exists(join(resourceRoot, 'runtime', 'package', 'bin', 'claude-desktop-mac-zh-cn.mjs')), true);
  assert.equal(await exists(join(paths.output, 'Contents', 'MacOS', 'ClaudeChineseGenerator')), true);
  const plist = await readFile(join(paths.output, 'Contents', 'Info.plist'), 'utf8');
  assert.match(plist, /com\.kiletry\.claude-desktop-mac-zh-cn-generator/);
  assert.match(plist, /Claude 中文生成器/);
});

test('rejects a runtime directory without both architecture binaries', async () => {
  const paths = await fixture();
  await writeFile(join(paths.runtimeDir, 'node-x64'), '');
  // An empty binary is not a runnable embedded runtime.
  await assert.rejects(
    () => buildGeneratorApp({ ...paths, sourceCommit: 'abc123' }),
    /node-x64.*non-empty/i,
  );
});

test('copies only the package allow-list and excludes apps, build artifacts, Keychain files, and key fixtures', async () => {
  const paths = await fixture();
  await mkdir(join(paths.rootDir, 'Claude.app'), { recursive: true });
  await mkdir(join(paths.rootDir, 'Claude 中文.app'), { recursive: true });
  await mkdir(join(paths.rootDir, '.build'), { recursive: true });
  await writeFile(join(paths.rootDir, 'login.keychain-db'), 'private keychain material');
  await writeFile(join(paths.rootDir, '.env'), 'OPENAI_API_KEY=sk_fixture_should_not_ship');
  await buildGeneratorApp({ ...paths, sourceCommit: 'abc123' });

  const packageRoot = join(paths.output, 'Contents', 'Resources', 'runtime', 'package');
  for (const name of ['Claude.app', 'Claude 中文.app', '.build', 'login.keychain-db', '.env']) {
    assert.equal(await exists(join(packageRoot, name)), false, `${name} must not be packaged`);
  }
  assert.equal(await exists(join(packageRoot, 'bin', 'claude-desktop-mac-zh-cn.mjs')), true);
  assert.equal(await exists(join(packageRoot, 'src', 'cli.mjs')), true);
});

test('rejects dangerous output destinations before removing anything', async () => {
  const paths = await fixture();
  await assert.rejects(
    () => buildGeneratorApp({ ...paths, output: '/Applications/Claude.app' }),
    /safe generated-app destination|refusing to remove/i,
  );
  await assert.rejects(
    () => buildGeneratorApp({ ...paths, output: paths.rootDir }),
    /safe generated-app destination|refusing to remove/i,
  );
});

test('dereferences package symlinks so the generated app is self-contained', async () => {
  const paths = await fixture();
  await mkdir(join(paths.rootDir, 'node_modules', '.bin'), { recursive: true });
  await symlink('../safe-package/index.js', join(paths.rootDir, 'node_modules', '.bin', 'safe-package'));

  await buildGeneratorApp({ ...paths, sourceCommit: 'abc123' });

  const packagedLink = join(paths.output, 'Contents', 'Resources', 'runtime', 'package', 'node_modules', '.bin', 'safe-package');
  assert.equal((await lstat(packagedLink)).isSymbolicLink(), false);
  assert.equal(await readFile(packagedLink, 'utf8'), 'export default true;\n');
});
