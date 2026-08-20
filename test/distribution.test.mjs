import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const dmgBuilder = join(projectRoot, 'scripts', 'build-dmg.sh');
const verifier = join(projectRoot, 'scripts', 'verify-generator-bundle.sh');

async function generatorApp(root) {
  const app = join(root, 'Claude 中文生成器.app');
  await mkdir(join(app, 'Contents', 'Resources', 'runtime', 'package', 'bin'), { recursive: true });
  await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0"?><plist><dict>
<key>CFBundleIdentifier</key><string>com.kiletry.claude-desktop-mac-zh-cn-generator</string>
</dict></plist>\n`);
  await writeFile(join(app, 'Contents', 'Resources', 'runtime', 'node-arm64'), 'arm');
  await writeFile(join(app, 'Contents', 'Resources', 'runtime', 'node-x64'), 'x64');
  await writeFile(join(app, 'Contents', 'Resources', 'runtime', 'package', 'bin', 'claude-desktop-mac-zh-cn.mjs'), '');
  return app;
}

function run(command, args, env = {}) {
  return spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('DMG builder requires an existing generator app', () => {
  const result = run(dmgBuilder, ['--app', '/tmp/not-a-generator.app', '--output', '/tmp/ignored.dmg']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /generator app does not exist/i);
});

test('DMG builder rejects a generator-named symlink before signing its Claude target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-dmg-symlink-'));
  const officialApp = join(root, 'Claude.app');
  const disguisedApp = join(root, 'Claude 中文生成器.app');
  const output = join(root, 'Claude 中文生成器-macOS.dmg');
  const codesignMarker = join(root, 'codesign-was-called');
  const codesign = join(root, 'fake-codesign');
  await mkdir(officialApp);
  await symlink(officialApp, disguisedApp);
  await writeFile(codesign, `#!/bin/sh\ntouch "$CODESIGN_MARKER"\n`);
  await chmod(codesign, 0o755);

  const result = run(dmgBuilder, ['--app', disguisedApp, '--output', output], {
    CODESIGN_BIN: codesign,
    CODESIGN_MARKER: codesignMarker,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /symbolic link|non-generator app|Claude\.app/i);
  await assert.rejects(readFile(codesignMarker));
});

test('DMG builder rejects embedded Claude apps before signing or copying', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-dmg-embedded-'));
  const app = await generatorApp(root);
  const output = join(root, 'Claude 中文生成器-macOS.dmg');
  const codesignMarker = join(root, 'codesign-was-called');
  const codesign = join(root, 'fake-codesign');
  await mkdir(join(app, 'Contents', 'Resources', 'Claude.app'));
  await writeFile(codesign, `#!/bin/sh\ntouch "$CODESIGN_MARKER"\n`);
  await chmod(codesign, 0o755);

  const result = run(dmgBuilder, ['--app', app, '--output', output], {
    CODESIGN_BIN: codesign,
    CODESIGN_MARKER: codesignMarker,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not embed Claude\.app/i);
  await assert.rejects(readFile(codesignMarker));
});

test('DMG builder stages only generator app and Applications alias before creating image', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-dmg-builder-'));
  const app = await generatorApp(root);
  const output = join(root, 'Claude 中文生成器-macOS.dmg');
  const hdiutil = join(root, 'fake-hdiutil');
  const observation = join(root, 'observation.json');
  await writeFile(hdiutil, `#!/bin/sh
set -eu
source=""
last=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-srcfolder" ]; then source="$2"; shift 2; continue; fi
  last="$1"; shift
done
node -e 'const fs=require("fs"); const source=process.argv[1]; const out=process.argv[2]; fs.writeFileSync(out, JSON.stringify({names:fs.readdirSync(source).sort(), applicationsIsLink:fs.lstatSync(source + "/Applications").isSymbolicLink(), applicationsTarget:fs.readlinkSync(source + "/Applications")}));' "$source" "$DMG_OBSERVATION"
touch "$last"
`);
  await chmod(hdiutil, 0o755);

  const result = run(dmgBuilder, ['--app', app, '--output', output], {
    HDIUTIL_BIN: hdiutil,
    DMG_OBSERVATION: observation,
    CODESIGN_BIN: '/usr/bin/true',
  });

  assert.equal(result.status, 0, result.stderr);
  const staged = JSON.parse(await readFile(observation, 'utf8'));
  assert.deepEqual(staged.names, ['Applications', 'Claude 中文生成器.app']);
  assert.equal(staged.applicationsIsLink, true);
  assert.equal(staged.applicationsTarget, '/Applications');
});

test('bundle verifier rejects a missing embedded runtime before signature checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-dmg-verifier-'));
  const app = await generatorApp(root);
  const result = run(verifier, [app]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing required embedded runtime/i);
});

test('bundle verifier rejects an embedded Claude application', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-dmg-verifier-'));
  const app = await generatorApp(root);
  await mkdir(join(app, 'Contents', 'Resources', 'Claude.app'), { recursive: true });
  const result = run(verifier, [app]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not embed Claude\.app/i);
});

test('bundle verifier rejects a symlink named as an embedded Claude application', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-dmg-verifier-'));
  const app = await generatorApp(root);
  const target = join(root, 'external-Claude.app');
  await mkdir(target);
  await symlink(target, join(app, 'Contents', 'Resources', 'Claude.app'));
  const result = run(verifier, [app]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not embed Claude\.app/i);
});
