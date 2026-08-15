import { createHash } from 'node:crypto';

import { CompatibilityError } from './errors.mjs';

const DEFAULT_OWNER = 'ICERainbow666';
const DEFAULT_REPO = 'claude-desktop-zh-cn';
const DEFAULT_REF = 'master';
const TRANSLATION_KEYS = ['ion-dist', 'desktop-shell', 'dynamic'];

function apiUrl(owner, repo, path, ref) {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
  if (ref) url.searchParams.set('ref', ref);
  return url;
}

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new CompatibilityError(`GitHub request failed (${response.status})`);
  return response.json();
}

async function getText(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new CompatibilityError(`GitHub request failed (${response.status})`);
  return response.text();
}

export async function fetchUpstreamCatalog({
  fetchImpl = globalThis.fetch,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  ref = DEFAULT_REF,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new CompatibilityError('Fetch API is unavailable');
  const commit = await getJson(fetchImpl, `https://api.github.com/repos/${owner}/${repo}/commits/${ref}`);
  const entries = await getJson(fetchImpl, apiUrl(owner, repo, 'translated-zh-CN', ref));
  const versions = entries
    .filter((entry) => entry.type === 'dir' && /^\d+(?:\.\d+){3}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (versions.length === 0) throw new CompatibilityError('Upstream translation catalog has no version directories');
  return { commit: commit.sha, versions, owner, repo, ref };
}

export function validateTranslationJson(value, sourcePath) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new CompatibilityError(`${sourcePath} must have an object root`);
  }
  if (Object.values(value).some((message) => typeof message !== 'string')) {
    throw new CompatibilityError(`${sourcePath} must contain only string values`);
  }
  return value;
}

export function digestJson(value) {
  const serialized = JSON.stringify(value);
  return {
    bytes: Buffer.byteLength(serialized, 'utf8'),
    sha256: createHash('sha256').update(serialized, 'utf8').digest('hex'),
  };
}

function decodeContent(payload, sourcePath) {
  if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new CompatibilityError(`${sourcePath} is not a base64 GitHub content response`);
  }
  try {
    return JSON.parse(Buffer.from(payload.content.replaceAll('\n', ''), 'base64').toString('utf8'));
  } catch (error) {
    throw new CompatibilityError(`${sourcePath} contains invalid JSON`, { cause: error });
  }
}

export async function downloadTranslation({ fetchImpl = globalThis.fetch, commit, version }) {
  if (!commit?.owner || !commit?.repo || !commit?.ref || !commit?.sha) {
    throw new CompatibilityError('Translation source metadata is incomplete');
  }
  const files = {};
  const digests = {};
  for (const key of TRANSLATION_KEYS) {
    const sourcePath = `translated-zh-CN/${version}/${key}/zh-CN.json`;
    try {
      const payload = await getJson(fetchImpl, apiUrl(commit.owner, commit.repo, sourcePath, commit.ref));
      const rawValue = payload.encoding === 'base64'
        ? decodeContent(payload, sourcePath)
        : payload.git_url
          ? decodeContent(await getJson(fetchImpl, payload.git_url), sourcePath)
        : payload.download_url
          ? JSON.parse(await getText(fetchImpl, payload.download_url))
          : null;
      const value = validateTranslationJson(rawValue, sourcePath);
      files[key] = value;
      digests[key] = digestJson(value);
    } catch (error) {
      if (error instanceof CompatibilityError && /failed \(404\)/.test(error.message)) continue;
      throw error;
    }
  }
  if (!files['ion-dist'] || !files['desktop-shell']) {
    throw new CompatibilityError(`Translation ${version} is missing required locale files`);
  }
  return { files, digests, commit: commit.sha, version };
}
