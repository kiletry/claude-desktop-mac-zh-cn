#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--release-dir', '--tag'].includes(key) || !process.argv[i + 1]) throw new Error('Expected --release-dir directory --tag vX.Y.Z');
  options[key] = process.argv[i + 1];
}
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tag = options['--tag'];
if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '') || tag !== `v${version}`) throw new Error('Update metadata requires the exact stable package version tag');
if (!options['--release-dir']) throw new Error('Missing --release-dir');
const directory = resolve(options['--release-dir']);
const base = 'https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/';
const assets = [];
for (const name of [`Claude-${tag}-macOS.dmg`, 'SHA256SUMS']) {
  const file = await stat(join(directory, name));
  if (!file.isFile() || file.size <= 0 || file.size > 500_000_000) throw new Error(`Invalid release file: ${name}`);
  assets.push({ name, size: file.size, browser_download_url: `${base}download/${tag}/${name}` });
}
await writeFile(join(directory, 'generator-update.json'), JSON.stringify({
  tag_name: tag,
  html_url: `${base}tag/${tag}`,
  draft: false,
  prerelease: false,
  body: '',
  assets,
}, null, 2) + '\n');
