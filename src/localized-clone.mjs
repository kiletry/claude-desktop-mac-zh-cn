import { CompatibilityError } from './errors.mjs';

const SUPPORTED_LOCALE_ARRAY = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';

export function selectCloneTranslationVersion(appVersion, versions) {
  const target = numericVersion(appVersion);
  const candidates = versions
    .map((version) => ({ version, parts: numericVersion(version) }))
    .sort((left, right) => compareVersions(left.parts, right.parts));
  if (candidates.length === 0) {
    throw new CompatibilityError('No upstream Chinese translation versions are available.');
  }
  const compatible = candidates.filter(({ parts }) => compareVersions(parts, target) <= 0);
  return (compatible.at(-1) ?? candidates[0]).version;
}

export function validateTranslationPayloads(payloads) {
  if (payloads === null || typeof payloads !== 'object' || Array.isArray(payloads)) {
    throw new CompatibilityError('Translation payloads must be an object.');
  }
  for (const [name, payload] of Object.entries(payloads)) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new CompatibilityError(`Translation payload ${name} must be an object.`);
    }
    if (Object.values(payload).some((value) => typeof value !== 'string')) {
      throw new CompatibilityError(`Translation payload ${name} must contain only string values.`);
    }
  }
  return payloads;
}

export function buildTranslationResourcePlan({ resourcesDir, sourceFiles, availableDirectories }) {
  const resourceDefinitions = [
    {
      source: 'ion',
      directory: `${resourcesDir}/ion-dist/i18n`,
      destination: `${resourcesDir}/ion-dist/i18n/zh-CN.json`,
    },
    {
      source: 'dynamic',
      directory: `${resourcesDir}/ion-dist/i18n/dynamic`,
      destination: `${resourcesDir}/ion-dist/i18n/dynamic/zh-CN.json`,
    },
    {
      source: 'desktop',
      directory: `${resourcesDir}/desktop-shell/i18n`,
      destination: `${resourcesDir}/desktop-shell/i18n/zh-CN.json`,
    },
  ];
  const writes = [];
  const skipped = [];
  for (const definition of resourceDefinitions) {
    if (!availableDirectories.has(definition.directory)) {
      skipped.push({ source: definition.source, reason: 'destination-directory-missing' });
      continue;
    }
    if (typeof sourceFiles[definition.source] !== 'string') {
      throw new CompatibilityError(`Missing ${definition.source} translation resource.`);
    }
    writes.push({
      source: definition.source,
      destination: definition.destination,
      content: sourceFiles[definition.source],
    });
  }
  return { writes, skipped };
}

export function patchLocaleRegistry(source) {
  const target = `Bc=${SUPPORTED_LOCALE_ARRAY}`;
  const matches = [...source.matchAll(new RegExp(escapeRegExp(target), 'g'))];
  if (matches.length !== 1) {
    throw new CompatibilityError(`Expected exactly one supported locale registry, found ${matches.length}.`);
  }
  const offset = matches[0].index + target.length;
  return `${source.slice(0, offset - 1)},"zh-CN"${source.slice(offset - 1)}`;
}

function numericVersion(value) {
  const parts = String(value).split('.');
  if (!parts.every((part) => /^\d+$/.test(part))) {
    throw new CompatibilityError(`Unsupported Claude version: ${value}`);
  }
  return [...parts.map(Number), 0, 0, 0, 0].slice(0, 4);
}

function compareVersions(left, right) {
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
