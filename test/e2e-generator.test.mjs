import assert from 'node:assert/strict';
import { chmod, cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const verifier = join(projectRoot, 'scripts', 'verify-generator-bundle.sh');

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'claude-generator-e2e-'));
  const app = join(root, 'Claude 中文生成器.app');
  const runtime = join(app, 'Contents', 'Resources', 'runtime');
  const packaged = join(runtime, 'package');
  const official = join(root, 'Official Claude.app');
  const node = join(runtime, 'node-arm64');
  const x64Node = join(runtime, 'node-x64');
  const codesign = join(root, 'codesign');
  const plistBuddy = join(root, 'PlistBuddy');

  await mkdir(join(packaged, 'bin'), { recursive: true });
  await mkdir(join(official, 'Contents', 'Resources', 'ion-dist', 'i18n'), { recursive: true });
  await writeFile(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>com.kiletry.claude-desktop-mac-zh-cn-generator</string></dict></plist>`);
  await writeFile(join(official, 'Contents', 'Info.plist'), `<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>com.anthropic.claudefordesktop</string><key>CFBundleShortVersionString</key><string>1.30096.5</string></dict></plist>`);
  await cp(join(projectRoot, 'bin'), join(packaged, 'bin'), { recursive: true });
  await cp(join(projectRoot, 'src'), join(packaged, 'src'), { recursive: true });
  await cp(join(projectRoot, 'node_modules'), join(packaged, 'node_modules'), { recursive: true, dereference: true });
  await writeFile(node, '#!/bin/sh\nexec "$CLEAN_CHECK_HOST_NODE" "$@"\n');
  await writeFile(x64Node, '#!/bin/sh\nexec "$CLEAN_CHECK_HOST_NODE" "$@"\n');
  await writeFile(codesign, '#!/bin/sh\ncase "$1" in -dv) echo "Signature=adhoc" >&2;; esac\nexit 0\n');
  await writeFile(plistBuddy, '#!/bin/sh\nprintf "%s\\n" "com.kiletry.claude-desktop-mac-zh-cn-generator"\n');
  await Promise.all([node, x64Node, codesign, plistBuddy].map((path) => chmod(path, 0o755)));
  return { app, official, root, codesign, plistBuddy };
}

test('clean-machine verifier uses the embedded CLI and leaves the official fixture unchanged', async () => {
  const fixture = await createFixture();
  const result = spawnSync(verifier, ['--clean-check', fixture.app], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLEAN_CHECK_HOST_NODE: process.execPath,
      VERIFY_GENERATOR_CLEAN_APP_DIR: fixture.official,
      CODESIGN_BIN: fixture.codesign,
      PLISTBUDDY_BIN: fixture.plistBuddy,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Quality gate passed/);
  assert.match(result.stdout, /embedded CLI status path/);
  assert.equal(await readFile(join(fixture.official, 'Contents', 'Info.plist'), 'utf8'), `<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>com.anthropic.claudefordesktop</string><key>CFBundleShortVersionString</key><string>1.30096.5</string></dict></plist>`);
  console.log('Quality gate passed');
});
