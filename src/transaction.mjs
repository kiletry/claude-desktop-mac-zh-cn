import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { CompatibilityError } from './errors.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const serialize = (content) => typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;

async function atomicWrite(destination, content) {
  await mkdir(dirname(destination), { recursive: true });
  const temp = join(dirname(destination), `.${basename(destination)}.${process.pid}.tmp`);
  await writeFile(temp, content);
  await rename(temp, destination);
}

export async function applyTransaction({ backupRoot, plan, dryRun = false }) {
  if (dryRun) return {
    manifest: { dryRun: true, files: [], metadata: plan.metadata ?? {} },
    changedFiles: plan.fileWrites.map((file) => file.destination),
  };
  const operationId = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const operationDir = join(backupRoot, operationId);
  await mkdir(join(operationDir, 'originals'), { recursive: true });
  const manifest = { operationId, operationDir, metadata: plan.metadata ?? {}, files: [] };
  try {
    for (const file of plan.fileWrites) {
      const content = serialize(file.content);
      const originalExists = await exists(file.destination);
      const original = originalExists ? await readFile(file.destination) : null;
      const record = {
        destination: file.destination,
        backupPath: originalExists ? join(operationDir, 'originals', `${manifest.files.length}-${basename(file.destination)}`) : null,
        originalSha256: original ? digest(original) : null,
        installedSha256: digest(Buffer.from(content)),
        originalExists,
      };
      if (original) await copyFile(file.destination, record.backupPath);
      manifest.files.push(record);
      await atomicWrite(file.destination, content);
    }
    await atomicWrite(join(operationDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return { manifest, changedFiles: manifest.files.map((file) => file.destination) };
  } catch (error) {
    await rollbackFiles(manifest.files);
    throw error;
  }
}

async function rollbackFiles(files) {
  for (const file of [...files].reverse()) {
    if (file.originalExists) await copyFile(file.backupPath, file.destination);
    else if (await exists(file.destination)) await unlink(file.destination);
  }
}

export async function restoreTransaction(manifest) {
  for (const file of manifest.files) {
    if (!(await exists(file.destination))) {
      if (file.originalExists) throw new CompatibilityError(`Restore target disappeared: ${file.destination}`);
      continue;
    }
    const current = await readFile(file.destination);
    if (digest(current) !== file.installedSha256) {
      throw new CompatibilityError(`Restore target changed after install: ${file.destination}`);
    }
  }
  await rollbackFiles(manifest.files);
  await rm(manifest.operationDir, { recursive: true, force: true });
}
