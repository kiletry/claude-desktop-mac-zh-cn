import assert from 'node:assert/strict';
import { execFile as exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
const execFile = promisify(exec);
const helper = resolve('installer-macos/Resources/install-update.sh');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'generator-update-'));
  const target = join(root, 'Claude 中文生成器.app');
  const staged = join(root, '.claude-generator-update-fixture.app');
  for (const [app, version] of [[target, '0.1.9'], [staged, '0.1.10']]) {
    await mkdir(join(app, 'Contents', 'MacOS'), { recursive: true });
    await execFile('/bin/cp', ['/usr/bin/true', join(app, 'Contents', 'MacOS', 'Generator')]);
    await writeFile(join(app, 'Contents', 'Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.kiletry.claude-desktop-mac-zh-cn-generator</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleExecutable</key><string>Generator</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
    await execFile('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  }
  return { root, target, staged, receipt: join(root, 'result.txt') };
}
async function run(f, pid = '99999999', timeout = '1') {
  return execFile('/bin/sh', [helper, pid, f.target, f.staged, '0.1.9', '0.1.10', f.receipt, timeout]);
}
test('update helper replaces only the generator and preserves a rollback copy', async () => {
  const f = await fixture();
  await run(f);
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.10/);
  assert.match(await readFile(join(f.staged + '.previous', 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
  assert.match(await readFile(f.receipt, 'utf8'), /installed/);
});
test('invalid or changed staged app preserves the old generator', async () => {
  const f = await fixture();
  await writeFile(join(f.staged, 'Contents/Info.plist'), 'changed');
  await assert.rejects(run(f));
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
});
test('helper times out while old process is alive without replacing it', async () => {
  const f = await fixture();
  await assert.rejects(run(f, String(process.pid)));
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
});
test('helper rejects linked target and paths that name an official or localized Claude app', async () => {
  const f = await fixture();
  const linked = join(f.root, 'link', 'Claude 中文生成器.app');
  await mkdir(join(f.root, 'link'));
  await symlink(f.target, linked);
  await assert.rejects(run({ ...f, target: linked }));
  await assert.rejects(run({ ...f, target: join(f.root, 'Claude.app') }));
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
});

test('helper rolls back a replaced app if completion cannot be recorded', async () => {
  const f = await fixture();
  await mkdir(f.receipt);
  await assert.rejects(run(f));
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
  await execFile('/usr/bin/lockf', ['-k', '-t', '0', join(f.root, '.claude-generator-install.lock'), '/usr/bin/true']);
});

test('helper rejects a generator updated by another process after staging', async () => {
  const f = await fixture();
  const plist = join(f.target, 'Contents/Info.plist');
  await writeFile(plist, (await readFile(plist, 'utf8')).replace('0.1.9', '0.1.11'));
  await execFile('/usr/bin/codesign', ['--force', '--sign', '-', f.target]);
  await assert.rejects(run(f));
  assert.match(await readFile(plist, 'utf8'), /0\.1\.11/);
});

test('helper records a pre-swap validation failure for the next launch', async () => {
  const f = await fixture();
  await writeFile(join(f.staged, 'Contents/Info.plist'), 'changed');
  await assert.rejects(run(f));
  assert.equal(await readFile(f.receipt, 'utf8'), 'failed\n');
});

test('helper acknowledges readiness before waiting for the running app to exit', async () => {
  const f = await fixture();
  const pending = assert.rejects(run(f, String(process.pid), '3'));
  for (let i = 0; i < 40; i++) {
    if (await readFile(f.receipt + '.ready', 'utf8').catch(() => '') === 'ready\n') break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await readFile(f.receipt + '.ready', 'utf8'), 'ready\n');
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
  await pending;
});

for (const boundary of ['/bin/mv "$target" "$backup"', '/bin/mv "$staged" "$target"']) {
  test(`helper restores old app when terminated immediately after ${boundary}`, async () => {
    const f = await fixture();
    const injected = join(f.root, 'injected.sh');
    await writeFile(injected, (await readFile(helper, 'utf8')).replace(boundary, boundary + '\nkill -TERM $$'));
    await assert.rejects(execFile('/bin/sh', [injected, '99999999', f.target, f.staged, '0.1.9', '0.1.10', f.receipt, '1']));
    assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
    assert.equal(await readFile(f.receipt, 'utf8'), 'failed\n');
  });
}

test('advisory lock excludes another installer and a leftover unlocked file permits retry', async () => {
  const f = await fixture();
  const lock = join(f.root, '.claude-generator-install.lock');
  const holder = execFile('/usr/bin/lockf', ['-k', '-t', '0', lock, '/bin/sleep', '2']);
  await new Promise(resolve => setTimeout(resolve, 200));
  await assert.rejects(run(f));
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.9/);
  await holder;
  await run(f);
  assert.match(await readFile(join(f.target, 'Contents/Info.plist'), 'utf8'), /0\.1\.10/);
});

test('each helper acknowledges only its private ready path', async () => {
  const f = await fixture();
  const ready = join(f.root, 'private-ready.txt');
  await execFile('/bin/sh', [helper, '99999999', f.target, f.staged, '0.1.9', '0.1.10', f.receipt, '1', 'no', ready]);
  assert.equal(await readFile(ready, 'utf8'), 'ready\n');
  assert.equal(await readFile(f.receipt, 'utf8'), 'installed\n');
});
