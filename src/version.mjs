import { CompatibilityError, UserError } from './errors.mjs';

function parseVersion(input) {
  if (typeof input !== 'string' || !/^\d+(?:\.\d+){2,3}$/.test(input)) {
    throw new UserError(`Invalid Claude version: ${input}`);
  }
  const parts = input.split('.').map(Number);
  while (parts.length < 4) parts.push(0);
  return parts;
}

export function normalizeClaudeVersion(input) {
  const parts = parseVersion(input);
  return { upstream: parts.join('.'), parts };
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 4; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function selectTranslationVersion(appVersion, versions, { allowNearest = false } = {}) {
  const normalized = normalizeClaudeVersion(appVersion).upstream;
  const available = [...new Set(versions)].map((version) => normalizeClaudeVersion(version).upstream);
  const exact = available.find((version) => compareVersions(version, normalized) === 0);
  if (exact) return { version: exact, exact: true, relation: 'exact' };
  if (!allowNearest) {
    throw new CompatibilityError(`No exact translation exists for Claude ${normalized}`);
  }
  const lower = available
    .filter((version) => compareVersions(version, normalized) < 0)
    .sort((a, b) => compareVersions(b, a));
  if (lower.length === 0) {
    throw new CompatibilityError(`No compatible older translation exists for Claude ${normalized}`);
  }
  return { version: lower[0], exact: false, relation: 'older' };
}
