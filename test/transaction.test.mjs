import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CompatibilityError } from '../src/errors.mjs';
import { applyTransaction, restoreTransaction } from '../src/transaction.mjs';

test('writes a backup manifest and restores only unchanged installed files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-transaction-'));
  const target = join(root, 'zh-CN.json');
  await writeFile(target, 'old');
  const applied = await applyTransaction({
    backupRoot: join(root, 'backups'),
    plan: { fileWrites: [{ destination: target, content: 'new' }], metadata: { version: '1.0.0.0' } },
  });
  assert.equal(await readFile(target, 'utf8'), 'new');
  assert.equal(applied.manifest.files[0].originalSha256.length, 64);
  await restoreTransaction(applied.manifest);
  assert.equal(await readFile(target, 'utf8'), 'old');
});

test('refuses restore after a target has drifted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-transaction-'));
  const target = join(root, 'zh-CN.json');
  await writeFile(target, 'old');
  const applied = await applyTransaction({ backupRoot: join(root, 'backups'), plan: { fileWrites: [{ destination: target, content: 'new' }] } });
  await writeFile(target, 'other');
  await assert.rejects(restoreTransaction(applied.manifest), CompatibilityError);
  assert.equal(await readFile(target, 'utf8'), 'other');
});

test('dry-run does not create backups or write files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-transaction-'));
  const target = join(root, 'zh-CN.json');
  const applied = await applyTransaction({ backupRoot: join(root, 'backups'), dryRun: true, plan: { fileWrites: [{ destination: target, content: 'new' }] } });
  assert.deepEqual(applied.changedFiles, [target]);
  await assert.rejects(readFile(target), /ENOENT/);
});
