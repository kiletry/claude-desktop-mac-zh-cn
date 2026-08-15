import { CompatibilityError } from './errors.mjs';

const UPSTREAM_OWNER = 'ICERainbow666';
const UPSTREAM_REPO = 'claude-desktop-zh-cn';

export function selectCompatibleTranslationVersion(appVersion, versions) {
  const target = numericVersion(appVersion);
  const candidates = versions
    .map((version) => ({ version, parts: numericVersion(version) }))
    .sort((left, right) => compareVersionParts(left.parts, right.parts));
  if (candidates.length === 0) throw new CompatibilityError('No upstream Chinese translation versions are available.');

  const compatible = candidates.filter(({ parts }) => compareVersionParts(parts, target) <= 0);
  return (compatible.at(-1) ?? candidates[0]).version;
}

export async function downloadCompatibleTranslation(appVersion, fetchImpl = fetch) {
  const commit = await fetchJson(`https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits/master`, fetchImpl);
  if (typeof commit.sha !== 'string') throw new CompatibilityError('Upstream GitHub response did not include a commit SHA.');
  const tree = await fetchJson(`https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/trees/${commit.sha}?recursive=1`, fetchImpl);
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
    fetchTranslationJson(`${base}/ion-dist/zh-CN.json?ref=${commit.sha}`, fetchImpl),
    fetchTranslationJson(`${base}/ion-dist/dynamic/zh-CN.json?ref=${commit.sha}`, fetchImpl),
    fetchTranslationJson(`${base}/desktop-shell/zh-CN.json?ref=${commit.sha}`, fetchImpl),
  ]);
  return { commit: commit.sha, version, files: { ion, dynamic, desktop } };
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new CompatibilityError(`Unable to download upstream metadata: ${url}`);
  return response.json();
}

async function fetchTranslationJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new CompatibilityError(`Unable to download upstream translation: ${url}`);
  let payload = await response.json();
  if (payload.encoding === 'none' && typeof payload.git_url === 'string') {
    payload = await fetchJson(payload.git_url, fetchImpl);
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
