import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createBackup,
  normalizeGenerationOptions,
  pruneBackups,
} from '../src/backup-manager.mjs';

async function makeApp(root, name = 'Claude.app') {
  const app = join(root, name);
  await mkdir(join(app, 'Contents', 'Resources'), { recursive: true });
  await writeFile(join(app, 'Contents', 'Resources', 'marker.txt'), 'official');
  return app;
}

test('normalizes generation defaults and rejects invalid backup settings', () => {
  assert.deepEqual(normalizeGenerationOptions({}), {
    appMode: 'clone',
    translationMode: 'full',
    backupPolicy: 'versioned',
    backupCount: 1,
    backupDir: join(process.env.HOME ?? '/Users/sunlu', 'Library', 'Application Support', 'ClaudeChineseGenerator', 'Backups'),
  });
  assert.throws(() => normalizeGenerationOptions({ appMode: 'unknown' }), /app-mode/i);
  assert.throws(() => normalizeGenerationOptions({ translationMode: 'unsafe' }), /translation-mode/i);
  assert.throws(() => normalizeGenerationOptions({ backupPolicy: 'bad' }), /backup-policy/i);
  assert.throws(() => normalizeGenerationOptions({ backupCount: 0 }), /backup-count/i);
});

test('creates an overwrite backup atomically and writes a manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-backup-'));
  const sourcePath = await makeApp(root);
  const backupDir = join(root, 'backups');
  const result = await createBackup({
    sourcePath,
    backupDir,
    policy: 'overwrite',
    count: 1,
    metadata: { appVersion: '1.2.3', appMode: 'official', translationMode: 'full' },
  });
  assert.equal(result.policy, 'overwrite');
  assert.equal(result.path, join(backupDir, 'Claude.app.backup'));
  assert.equal(await readFile(join(result.path, 'Contents/Resources/marker.txt'), 'utf8'), 'official');
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  await assert.rejects(access(join(result.path, 'claude-chinese-backup-manifest.json')));
  assert.equal(manifest.appVersion, '1.2.3');
  assert.equal(manifest.sourcePath, sourcePath);
});

test('creates versioned backups and prunes only managed backups', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-backup-'));
  const sourcePath = await makeApp(root);
  const backupDir = join(root, 'backups');
  const first = await createBackup({
    sourcePath, backupDir, policy: 'versioned', count: 2,
    metadata: { appVersion: '1.2.3', appMode: 'official', translationMode: 'safe' },
    now: new Date('2026-09-26T10:00:00Z'),
  });
  const second = await createBackup({
    sourcePath, backupDir, policy: 'versioned', count: 2,
    metadata: { appVersion: '1.2.4', appMode: 'official', translationMode: 'safe' },
    now: new Date('2026-09-26T11:00:00Z'),
  });
  assert.match(first.path, /Claude\.app-1\.2\.3-20260926-180000\.backup$/);
  assert.match(second.path, /Claude\.app-1\.2\.4-20260926-190000\.backup$/);
  await writeFile(join(backupDir, 'keep-me.txt'), 'user file');
  const third = await createBackup({
    sourcePath, backupDir, policy: 'versioned', count: 2,
    metadata: { appVersion: '1.2.5', appMode: 'official', translationMode: 'safe' },
    now: new Date('2026-09-26T12:00:00Z'),
  });
  const pruned = await pruneBackups({ backupDir, count: 2 });
  assert.equal(pruned.removed.length, 0);
  await assert.rejects(access(first.path));
  await access(second.path);
  await access(third.path);
  assert.equal(await readFile(join(backupDir, 'keep-me.txt'), 'utf8'), 'user file');
});
