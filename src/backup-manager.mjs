import { access, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

import { UserError } from './errors.mjs';

const DEFAULT_BACKUP_DIR = join(homedir(), 'Library', 'Application Support', 'ClaudeChineseGenerator', 'Backups');
const MANIFEST_NAME = 'claude-chinese-backup-manifest.json';
const MANAGED_MARKER = 'Claude Chinese Generator backup';

export function normalizeGenerationOptions(options = {}) {
  const appMode = options.appMode ?? 'clone';
  const translationMode = options.translationMode ?? 'full';
  const backupPolicy = options.backupPolicy ?? 'versioned';
  const backupCount = options.backupCount ?? 1;
  if (!['clone', 'official'].includes(appMode)) throw new UserError(`Invalid --app-mode: ${appMode}`);
  if (!['full', 'safe'].includes(translationMode)) throw new UserError(`Invalid --translation-mode: ${translationMode}`);
  if (!['overwrite', 'versioned'].includes(backupPolicy)) throw new UserError(`Invalid --backup-policy: ${backupPolicy}`);
  if (!Number.isInteger(backupCount) || backupCount < 1) throw new UserError('--backup-count must be a positive integer.');
  return { appMode, translationMode, backupPolicy, backupCount, backupDir: options.backupDir ?? DEFAULT_BACKUP_DIR };
}

export async function createBackup({ sourcePath, backupDir, policy = 'versioned', count = 1, metadata = {}, now = new Date() }) {
  if (!isAbsolute(sourcePath) || !isAbsolute(backupDir)) throw new UserError('Backup paths must be absolute.');
  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat?.isDirectory() || !sourcePath.endsWith('.app')) throw new UserError(`Backup source is not an app: ${sourcePath}`);
  const resolvedSource = sourcePath.replace(/\/$/, '');
  const resolvedBackup = backupDir.replace(/\/$/, '');
  const backupInsideSource = relative(resolvedSource, resolvedBackup);
  if (resolvedBackup === resolvedSource || (backupInsideSource && !backupInsideSource.startsWith('..') && !backupInsideSource.startsWith('/'))) {
    throw new UserError('Backup directory must not be the app itself or inside the app.');
  }
  await mkdir(backupDir, { recursive: true });
  const timestamp = formatTimestamp(now);
  const version = String(metadata.appVersion ?? 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
  const targetName = policy === 'overwrite'
    ? 'Claude.app.backup'
    : `Claude.app-${version}-${timestamp}.backup`;
  const targetPath = join(backupDir, targetName);
  const tempPath = join(backupDir, `.${targetName}.tmp-${process.pid}-${Date.now()}`);
  await rm(tempPath, { recursive: true, force: true });
  try {
    await cp(sourcePath, tempPath, { recursive: true, dereference: false, errorOnExist: true });
    const manifest = {
      marker: MANAGED_MARKER,
      sourcePath,
      backupPath: targetPath,
      createdAt: now.toISOString(),
      ...metadata,
    };
    await writeFile(`${tempPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    if (policy === 'overwrite') await rm(targetPath, { recursive: true, force: true });
    if (policy === 'overwrite') await rm(`${targetPath}.manifest.json`, { force: true });
    await rename(tempPath, targetPath);
    await rename(`${tempPath}.manifest.json`, `${targetPath}.manifest.json`);
  } catch (error) {
    await rm(tempPath, { recursive: true, force: true });
    await rm(`${tempPath}.manifest.json`, { force: true });
    throw error;
  }
  const pruned = policy === 'versioned' ? await pruneBackups({ backupDir, count }) : { removed: [] };
  return { path: targetPath, manifestPath: `${targetPath}.manifest.json`, policy, count, removed: pruned.removed };
}

export async function pruneBackups({ backupDir, count = 1 }) {
  if (!Number.isInteger(count) || count < 1) throw new UserError('--backup-count must be a positive integer.');
  const entries = await readdir(backupDir, { withFileTypes: true }).catch(() => []);
  const managed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.backup')) continue;
    const path = join(backupDir, entry.name);
    try {
      const manifest = JSON.parse(await readFile(`${path}.manifest.json`, 'utf8'));
      if (manifest.marker !== MANAGED_MARKER || manifest.backupPath !== path) continue;
      managed.push({ path, createdAt: Date.parse(manifest.createdAt) || 0 });
    } catch { /* unrelated or incomplete user file */ }
  }
  managed.sort((a, b) => b.createdAt - a.createdAt || b.path.localeCompare(a.path));
  const removed = [];
  for (const item of managed.slice(count)) {
    await rm(item.path, { recursive: true, force: true });
    removed.push(item.path);
  }
  return { removed, retained: managed.slice(0, count).map(({ path }) => path) };
}

function formatTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

export { DEFAULT_BACKUP_DIR, MANIFEST_NAME };
