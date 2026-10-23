#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { selectCompatibleTranslationVersion } from '../src/translation-source.mjs';
import { LOCAL_TRANSLATION_OVERRIDES } from '../src/local-translation-overrides.mjs';
import { supplementTranslationEntry } from '../src/local-catalogs.mjs';

export function buildTranslationPackage({ upstream, reference, packageVersion = 'development' }) {
  const files = Object.fromEntries(['ion', 'dynamic', 'desktop'].map((name) => [name, `${JSON.stringify({
    ...JSON.parse(reference.files[name] ?? '{}'),
    ...JSON.parse(upstream.files[name]),
    ...(LOCAL_TRANSLATION_OVERRIDES[name] ?? {}),
  }, null, 2)}\n`]));
  return {
    schemaVersion: 1,
    packageVersion,
    sources: [
      { repository: 'ICERainbow666/claude-desktop-zh-cn', commit: upstream.commit },
      { repository: 'javaht/claude-desktop-zh-cn', commit: reference.commit, role: 'fallback keys and locally retained text matches' },
      { repository: 'kiletry/claude-desktop-mac-zh-cn', path: 'src/translations/claude-3.6556.2.json', role: 'local supplemental translations' },
    ],
    translations: [supplementTranslationEntry({ version: upstream.version, commit: upstream.commit, files, english: upstream.english })],
  };
}

// Resolve revisions first, then download only the required files at those commits.
// Large moving branch archives made release builds unnecessarily slow and unrepeatable.
export async function downloadTranslationSources(fetchImpl = fetch) {
  const ice = 'ICERainbow666/claude-desktop-zh-cn';
  const javaht = 'javaht/claude-desktop-zh-cn';
  const [upstreamRevision, referenceRevision] = await Promise.all([
    getJson(`https://api.github.com/repos/${ice}/commits/master`),
    getJson(`https://api.github.com/repos/${javaht}/commits/main`),
  ]);
  for (const revision of [upstreamRevision, referenceRevision]) {
    if (!/^[a-f0-9]{40}$/.test(revision.sha ?? '')) throw new Error('Translation source did not return a commit SHA.');
  }
  const tree = await getJson(`https://api.github.com/repos/${ice}/git/trees/${upstreamRevision.sha}?recursive=1`);
  if (tree.truncated) throw new Error('Upstream translation tree was truncated.');
  const paths = new Set((tree.tree ?? []).map(({ path }) => path));
  const versions = [...paths].map((path) => /^translated-zh-CN\/(\d+(?:\.\d+){1,3})\/ion-dist\/zh-CN.json$/.exec(path)?.[1])
    .filter((version) => version && ['ion-dist/zh-CN.json', 'ion-dist/dynamic/zh-CN.json', 'desktop-shell/zh-CN.json'].every((path) => paths.has(`translated-zh-CN/${version}/${path}`)));
  const version = selectCompatibleTranslationVersion('9999.9999.9999', versions);
  const base = `https://api.github.com/repos/${ice}/contents/translated-zh-CN`;
  const refBase = `https://api.github.com/repos/${javaht}/contents/resources`;
  const [ion, dynamic, desktop, english, frontendReference, desktopReference] = await Promise.all([
    getText(`${base}/${version}/ion-dist/zh-CN.json?ref=${upstreamRevision.sha}`),
    getText(`${base}/${version}/ion-dist/dynamic/zh-CN.json?ref=${upstreamRevision.sha}`),
    getText(`${base}/${version}/desktop-shell/zh-CN.json?ref=${upstreamRevision.sha}`),
    getText(`${base}/ion-dist/en-US.json?ref=${upstreamRevision.sha}`),
    getText(`${refBase}/frontend-zh-CN.json?ref=${referenceRevision.sha}`),
    getText(`${refBase}/desktop-zh-CN.json?ref=${referenceRevision.sha}`),
  ]);
  return {
    upstream: { commit: upstreamRevision.sha, version, files: { ion, dynamic, desktop }, english },
    reference: { commit: referenceRevision.sha, files: { ion: frontendReference, desktop: desktopReference } },
  };

  async function request(url) {
    const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
    const headers = { Accept: 'application/json' };
    if (token && new URL(url).hostname === 'api.github.com') headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Unable to download translation source: ${url} (${response.status})`);
    return response;
  }
  async function getJson(url) { return (await request(url)).json(); }
  async function getText(url) {
    let payload = await getJson(url);
    if (payload.encoding === 'none' && typeof payload.git_url === 'string') payload = await getJson(payload.git_url);
    if (payload.encoding !== 'base64' || typeof payload.content !== 'string') throw new Error(`Translation source did not return file content: ${url}`);
    const text = Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object' || Object.values(value).some((item) => typeof item !== 'string')) {
      throw new Error(`Translation source must contain a string map: ${url}`);
    }
    return text;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex < 0 || !process.argv[outputIndex + 1]) throw new Error('Usage: build-translation-package.mjs --output PATH');
  const sources = await downloadTranslationSources();
  await writeFile(process.argv[outputIndex + 1], `${JSON.stringify(buildTranslationPackage({ ...sources, packageVersion: process.env.RELEASE_TAG ?? 'development' }))}\n`);
}
