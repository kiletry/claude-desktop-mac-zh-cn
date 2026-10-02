#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { selectCompatibleTranslationVersion } from '../src/translation-source.mjs';
import { LOCAL_TRANSLATION_OVERRIDES } from '../src/local-translation-overrides.mjs';

const execFile = promisify(execFileCallback);
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!output) throw new Error('Usage: build-translation-package.mjs --output PATH');

const upstream = await downloadUpstreamArchive();
const reference = await downloadReferenceResources();
const ion = mergeJson(upstream.files.ion, reference.frontend);
const desktop = mergeJson(upstream.files.desktop, reference.desktop);
const packageValue = {
  schemaVersion: 1,
  packageVersion: process.env.RELEASE_TAG ?? 'development',
  sources: [
    { repository: 'ICERainbow666/claude-desktop-zh-cn', commit: upstream.commit },
    { repository: 'javaht/claude-desktop-zh-cn', revision: 'main', role: 'fallback keys' },
  ],
  translations: [{
    version: upstream.version,
    commit: upstream.commit,
    files: {
      ion: applyOverrides(ion, 'ion'),
      dynamic: applyOverrides(upstream.files.dynamic, 'dynamic'),
      desktop: applyOverrides(desktop, 'desktop'),
    },
    english: upstream.english,
  }],
};
await writeFile(output, `${JSON.stringify(packageValue)}\n`);

async function downloadReferenceResources() {
  const root = await mkdtemp(join(tmpdir(), 'claude-zh-reference-'));
  const archive = join(root, 'reference.tar.gz');
  await downloadToFile('https://codeload.github.com/javaht/claude-desktop-zh-cn/tar.gz/refs/heads/main', archive);
  await execFile('/usr/bin/tar', ['-xzf', archive, '-C', root]);
  const extracted = join(root, 'claude-desktop-zh-cn-main', 'resources');
  try {
    return {
      frontend: await readFile(join(extracted, 'frontend-zh-CN.json'), 'utf8'),
      desktop: await readFile(join(extracted, 'desktop-zh-CN.json'), 'utf8'),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function downloadUpstreamArchive() {
  const root = await mkdtemp(join(tmpdir(), 'claude-zh-upstream-'));
  const archive = join(root, 'upstream.tar.gz');
  await downloadToFile('https://codeload.github.com/ICERainbow666/claude-desktop-zh-cn/tar.gz/refs/heads/master', archive);
  await execFile('/usr/bin/tar', ['-xzf', archive, '-C', root]);
  const translatedRoot = join(root, 'claude-desktop-zh-cn-master', 'translated-zh-CN');
  try {
    const entries = await import('node:fs/promises').then(({ readdir }) => readdir(translatedRoot, { withFileTypes: true }));
    const versions = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
      .filter((version) => /^\d+(?:\.\d+){1,3}$/.test(version));
    const version = selectCompatibleTranslationVersion('9999.9999.9999', versions);
    const base = join(translatedRoot, version);
    return {
      commit: 'master-archive',
      version,
      files: {
        ion: await readFile(join(base, 'ion-dist', 'zh-CN.json'), 'utf8'),
        dynamic: await readFile(join(base, 'ion-dist', 'dynamic', 'zh-CN.json'), 'utf8'),
        desktop: await readFile(join(base, 'desktop-shell', 'zh-CN.json'), 'utf8'),
      },
      english: await readFile(join(translatedRoot, 'ion-dist', 'en-US.json'), 'utf8'),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function downloadToFile(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download reference translations: ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

function mergeJson(baseText, fallbackText) {
  const base = JSON.parse(baseText);
  const fallback = JSON.parse(fallbackText);
  return `${JSON.stringify({ ...fallback, ...base }, null, 2)}\n`;
}

function applyOverrides(text, name) {
  const values = JSON.parse(text);
  return `${JSON.stringify({ ...values, ...(LOCAL_TRANSLATION_OVERRIDES[name] ?? {}) }, null, 2)}\n`;
}
