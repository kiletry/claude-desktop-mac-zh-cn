import { join } from 'node:path';

import { CompatibilityError } from './errors.mjs';

const KNOWN_LOCALES = ['en-US', 'de-DE', 'fr-FR', 'ko-KR', 'ja-JP', 'es-419', 'es-ES', 'it-IT', 'hi-IN', 'pt-BR', 'id-ID'];
const localeToken = '(?:en-US|de-DE|fr-FR|ko-KR|ja-JP|es-419|es-ES|it-IT|hi-IN|pt-BR|id-ID)';

function patchArray(text) {
  const pattern = new RegExp(`\\[(?:"${localeToken}"(?:,"${localeToken}")*)\\]`, 'g');
  const matches = [...text.matchAll(pattern)];
  if (matches.length > 1) throw new CompatibilityError('Multiple locale arrays found; refusing ambiguous patch');
  if (matches.length === 0) return { text, changed: false };
  const match = matches[0][0];
  return { text: text.replace(match, `${match.slice(0, -1)},"zh-CN"]`), changed: true };
}

function patchMap(text) {
  const pattern = new RegExp(`\\{(?:"${localeToken}":"[^"]+",?)+\\}`, 'g');
  const matches = [...text.matchAll(pattern)];
  if (matches.length > 1) throw new CompatibilityError('Multiple locale maps found; refusing ambiguous patch');
  if (matches.length === 0) return { text, changed: false };
  const match = matches[0][0];
  const separator = match.endsWith('}') && match.at(-2) === ',' ? '' : ',';
  return { text: text.replace(match, `${match.slice(0, -1)}${separator}"zh-CN":"zh"}`), changed: true };
}

export function planLocaleRegistryPatch(text) {
  if (typeof text !== 'string') throw new CompatibilityError('Locale registry must be text');
  if (text.includes('"zh-CN"')) return { changed: false, text, kind: 'registered' };
  const array = patchArray(text);
  const map = patchMap(array.text);
  if (!array.changed && !map.changed) throw new CompatibilityError('No supported locale registry target found');
  return {
    changed: true,
    text: map.text,
    kind: `${array.changed ? 'array' : ''}${array.changed && map.changed ? '+' : ''}${map.changed ? 'map' : ''}`,
  };
}

export function planResourceDestinations(layout, files) {
  const destinations = [];
  if (files['ion-dist'] && layout.i18nDir) destinations.push({ sourceKey: 'ion-dist', destination: join(layout.i18nDir, 'zh-CN.json') });
  if (files['desktop-shell'] && layout.desktopShellDir) destinations.push({ sourceKey: 'desktop-shell', destination: join(layout.desktopShellDir, 'zh-CN.json') });
  if (files.dynamic && layout.dynamicDir) destinations.push({ sourceKey: 'dynamic', destination: join(layout.dynamicDir, 'zh-CN.json') });
  return destinations;
}

export function buildPatchPlan(appInfo, selected, files) {
  const fileWrites = planResourceDestinations(appInfo.layout, files);
  if (fileWrites.length === 0) throw new CompatibilityError(`No compatible locale destinations for ${selected.version}`);
  return { fileWrites, registryPatches: [], warnings: selected.exact ? [] : ['nearest translation selected'] };
}

export { KNOWN_LOCALES };
