import { CompatibilityError } from './errors.mjs';
import { selectTranslationPackageEntry, validateTranslationPackage } from './translation-package.mjs';
import { readFile } from 'node:fs/promises';
import { LOCAL_TRANSLATION_OVERRIDES } from './local-translation-overrides.mjs';

const UPSTREAM_OWNER = 'ICERainbow666';
const UPSTREAM_REPO = 'claude-desktop-zh-cn';
const RELEASE_PACKAGE_URL = 'https://github.com/kiletry/claude-desktop-mac-zh-cn/releases/latest/download/claude-zh-translations.json';

export function selectCompatibleTranslationVersion(appVersion, versions) {
  const target = numericVersion(appVersion);
  const candidates = versions
    .map((version) => ({ version, parts: numericVersion(version) }))
    .sort((left, right) => compareVersionParts(left.parts, right.parts));
  if (candidates.length === 0) throw new CompatibilityError('No upstream Chinese translation versions are available.');

  const compatible = candidates.filter(({ parts }) => compareVersionParts(parts, target) <= 0);
  return (compatible.at(-1) ?? candidates[0]).version;
}

export async function downloadCompatibleTranslation(appVersion, fetchImpl = fetch, auth = {}) {
  const bundledPackage = await tryReadBundledPackage();
  if (bundledPackage) {
    const entry = selectTranslationPackageEntry(appVersion, bundledPackage);
    if (entry) return { ...applyLocalOverrides(entry), packageVersion: bundledPackage.packageVersion ?? null, source: 'bundled-package' };
  }
  const releasePackage = await tryDownloadReleasePackage(fetchImpl);
  if (releasePackage) {
    const entry = selectTranslationPackageEntry(appVersion, releasePackage);
    if (entry) return { ...applyLocalOverrides(entry), packageVersion: releasePackage.packageVersion ?? null, source: 'project-release' };
  }
  const requestOptions = { githubToken: auth.token ?? process.env.GITHUB_TOKEN };
  const commit = await fetchJson(`https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits/master`, fetchImpl, requestOptions);
  if (typeof commit.sha !== 'string') throw new CompatibilityError('Upstream GitHub response did not include a commit SHA.');
  const tree = await fetchJson(`https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/trees/${commit.sha}?recursive=1`, fetchImpl, requestOptions);
  const versionPaths = new Map();
  for (const item of tree.tree ?? []) {
    const match = /^translated-zh-CN\/([^/]+)\/(ion-dist\/zh-CN\.json|ion-dist\/dynamic\/zh-CN\.json|desktop-shell\/zh-CN\.json)$/.exec(item.path ?? '');
    if (!match) continue;
    const paths = versionPaths.get(match[1]) ?? new Set();
    paths.add(match[2]);
    versionPaths.set(match[1], paths);
  }
  const completeVersions = [...versionPaths]
    .filter(([, paths]) => paths.size === 3)
    .map(([candidate]) => candidate);
  const version = selectCompatibleTranslationVersion(appVersion, completeVersions);
  const base = `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/contents/translated-zh-CN/${version}`;
  const [ion, dynamic, desktop] = await Promise.all([
    fetchTranslationJson(`${base}/ion-dist/zh-CN.json?ref=${commit.sha}`, fetchImpl, requestOptions),
    fetchTranslationJson(`${base}/ion-dist/dynamic/zh-CN.json?ref=${commit.sha}`, fetchImpl, requestOptions),
    fetchTranslationJson(`${base}/desktop-shell/zh-CN.json?ref=${commit.sha}`, fetchImpl, requestOptions),
  ]);
  const english = await fetchTranslationJson(
    `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/contents/translated-zh-CN/ion-dist/en-US.json?ref=${commit.sha}`,
    fetchImpl,
    requestOptions,
  );
  return { commit: commit.sha, version, files: applyLocalOverrides({ files: { ion, dynamic, desktop } }).files, english, source: 'upstream-api' };
}

function applyLocalOverrides(entry) {
  const sourceFiles = entry.files ?? {};
  const files = Object.fromEntries(Object.entries(sourceFiles).map(([name, text]) => {
    const values = JSON.parse(text);
    return [name, `${JSON.stringify({ ...values, ...(LOCAL_TRANSLATION_OVERRIDES[name] ?? {}) }, null, 2)}\n`];
  }));
  return { ...entry, files };
}

async function tryReadBundledPackage() {
  const path = process.env.CLAUDE_ZH_TRANSLATION_PACKAGE;
  if (!path) return null;
  try {
    return validateTranslationPackage(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return null;
  }
}

async function tryDownloadReleasePackage(fetchImpl) {
  try {
    const response = await fetchImpl(RELEASE_PACKAGE_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const value = await response.json();
    return validateTranslationPackage(value);
  } catch {
    return null;
  }
}

async function fetchJson(url, fetchImpl, requestOptions = {}) {
  const response = await fetchImpl(url, { headers: buildGitHubHeaders(requestOptions) });
  if (!response.ok) throw new CompatibilityError(`Unable to download upstream metadata: ${url}`);
  return response.json();
}

async function fetchTranslationJson(url, fetchImpl, requestOptions = {}) {
  const response = await fetchImpl(url, { headers: buildGitHubHeaders(requestOptions) });
  if (!response.ok) throw new CompatibilityError(`Unable to download upstream translation: ${url}`);
  let payload = await response.json();
  if (payload.encoding === 'none' && typeof payload.git_url === 'string') {
    payload = await fetchJson(payload.git_url, fetchImpl, requestOptions);
  }
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new CompatibilityError(`Upstream translation did not return base64 file content: ${url}`);
  }
  const text = Buffer.from(payload.content.replace(/\s/g, ''), 'base64').toString('utf8');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CompatibilityError(`Upstream translation is not valid JSON: ${url}`);
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new CompatibilityError(`Upstream translation must have an object root: ${url}`);
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildGitHubHeaders({ githubToken } = {}) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (typeof githubToken === 'string' && githubToken.trim()) headers.Authorization = `Bearer ${githubToken.trim()}`;
  return headers;
}

function numericVersion(value) {
  const parts = String(value).split('.');
  if (!parts.every((part) => /^\d+$/.test(part))) {
    throw new CompatibilityError(`Unsupported Claude version: ${value}`);
  }
  return [...parts.map(Number), 0, 0, 0, 0].slice(0, 4);
}

function compareVersionParts(left, right) {
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
