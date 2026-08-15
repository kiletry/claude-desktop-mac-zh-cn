import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { CompatibilityError } from './errors.mjs';

export async function findPreferenceFiles(homeDir, { fs = { access } } = {}) {
  const candidates = [
    join(homeDir, 'Library', 'Application Support', 'Claude', 'config.json'),
    join(homeDir, 'Library', 'Application Support', 'Claude-3p', 'config.json'),
  ];
  const existing = [];
  for (const path of candidates) {
    try { await fs.access(path); existing.push(path); } catch { /* absent candidate */ }
  }
  return existing;
}

export function updateLocalePreference(rawJson, locale) {
  let config;
  try { config = JSON.parse(rawJson); } catch (error) {
    throw new CompatibilityError('Claude preference file contains invalid JSON', { cause: error });
  }
  if (!config || Array.isArray(config) || typeof config !== 'object') {
    throw new CompatibilityError('Claude preference file must contain a JSON object');
  }
  return `${JSON.stringify({ ...config, locale }, null, 2)}\n`;
}
