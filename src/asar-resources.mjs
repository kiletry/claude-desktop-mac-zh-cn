import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createPackageFromFiles, listPackage, statFile, uncache } from '@electron/asar';

// Native modules and other files Electron loads outside ASAR must remain unpacked.
export async function repackArchive(directory, archive) {
  const unpacked = listPackage(archive).filter(path => {
    const entry = statFile(archive, path.replace(/^\//, ''));
    return entry.unpacked && !entry.files;
  }).map(path => join(directory, path.replace(/^\//, '')).replace(/([\\*?\[\]{}()!+@,|])/g, '\\$1'));
  // The ASAR convenience API treats the source path as a glob. Enumerate literal
  // paths so user-selected directories containing brackets are packed correctly.
  const filenames = [];
  async function visit(parent) {
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const path = join(parent, entry.name);
      filenames.push(path);
      if (entry.isDirectory()) await visit(path);
    }
  }
  await visit(directory);
  uncache(archive);
  await createPackageFromFiles(directory, archive, filenames, {}, unpacked.length ? {
    unpack: unpacked.length === 1 ? unpacked[0] : `{${unpacked.join(',')}}`,
  } : {});
  uncache(archive);
}

export function updateIntegrityDigest(binary, integrity) {
  const data = Buffer.from(binary);
  const marker = Buffer.from('AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A');
  const hash = createHash('sha256');
  for (const key of Object.keys(integrity).sort()) {
    hash.update(key).update(integrity[key].algorithm).update(integrity[key].hash);
  }
  const digest = hash.digest();
  let slots = 0;
  for (let start = 0; ; ) {
    const index = data.indexOf(marker, start);
    if (index < 0) break;
    const slot = index + marker.length;
    if (slot + 34 > data.length) throw new Error('Truncated Electron integrity digest slot.');
    if (data[slot] === 1) {
      if (data[slot + 1] !== 1) throw new Error('Unsupported Electron integrity digest slot version.');
      digest.copy(data, slot + 2);
      slots += 1;
    }
    start = slot + 34;
  }
  return { data, slots };
}
