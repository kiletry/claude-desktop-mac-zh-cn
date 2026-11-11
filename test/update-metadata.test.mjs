import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const run = promisify(execFile);
const script = new URL('../scripts/build-update-metadata.mjs', import.meta.url).pathname;

test('release metadata describes actual DMG/checksums for the exact stable package version', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'generator-feed-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  const filename = `Claude-v${version}-macOS.dmg`;
  await writeFile(join(dir, filename), 'signed-image-fixture');
  await writeFile(join(dir, 'SHA256SUMS'), 'checksum-fixture\n');
  await run(process.execPath, [script, '--release-dir', dir, '--tag', `v${version}`]);
  const meta = JSON.parse(await readFile(join(dir, 'generator-update.json')));
  assert.equal(meta.tag_name, `v${version}`);
  assert.equal(meta.draft, false);
  assert.equal(meta.prerelease, false);
  assert.equal(meta.html_url, `https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/tag/v${version}`);
  assert.deepEqual(meta.assets.map(a => [a.name, a.size]), [[filename, 20], ['SHA256SUMS', 17]]);
  for (const asset of meta.assets) assert.equal(asset.browser_download_url, `https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/download/v${version}/${asset.name}`);
  await assert.rejects(run(process.execPath, [script, '--release-dir', dir, '--tag', 'v9.9.9']));
  await rm(join(dir, filename));
  await assert.rejects(run(process.execPath, [script, '--release-dir', dir, '--tag', `v${version}`]));
});
