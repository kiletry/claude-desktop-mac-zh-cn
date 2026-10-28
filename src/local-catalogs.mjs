import { readFileSync } from 'node:fs';

// Keep source text beside each translation: fallback matching never relies on a stale ID.
export const LOCAL_CATALOG_PATHS = ['src/translations/claude-3.6556.2.json', 'src/translations/claude-4.29.0.json'];
export const LOCAL_CATALOGS = Object.fromEntries(['ion', 'dynamic', 'desktop'].map(name => [name, {}]));
for (const path of LOCAL_CATALOG_PATHS) {
  const catalog = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  for (const name of Object.keys(LOCAL_CATALOGS)) Object.assign(LOCAL_CATALOGS[name], catalog[name]);
}

export function localTranslationsByText(name, catalogs = LOCAL_CATALOGS) {
  return Object.fromEntries(Object.values(catalogs[name] ?? {}).map(([from, to]) => [from, to]));
}

export function supplementLocalCatalog(name, english, chinese, catalogs = LOCAL_CATALOGS) {
  const byText = localTranslationsByText(name, catalogs);
  const result = { ...chinese };
  for (const [id, from] of Object.entries(english)) {
    const current = result[id];
    if (typeof current === 'string' && current.trim() && current !== from) continue;
    if (Object.hasOwn(byText, from)) result[id] = byText[from];
  }
  return result;
}

export function supplementTranslationEntry(entry, catalogs = LOCAL_CATALOGS) {
  const files = { ...entry.files };
  for (const name of ['ion', 'dynamic', 'desktop']) {
    const english = Object.fromEntries(Object.entries(catalogs[name] ?? {}).map(([id, [from]]) => [id, from]));
    files[name] = `${JSON.stringify(supplementLocalCatalog(name, english, JSON.parse(files[name]), catalogs), null, 2)}\n`;
  }
  const english = { ...JSON.parse(entry.english ?? '{}'), ...Object.fromEntries(Object.entries(catalogs.ion ?? {}).map(([id, [from]]) => [id, from])) };
  return { ...entry, files, english: `${JSON.stringify(english, null, 2)}\n` };
}
