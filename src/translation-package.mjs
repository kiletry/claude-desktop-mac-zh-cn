import { CompatibilityError } from './errors.mjs';

export function validateTranslationPackage(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || !Array.isArray(value.translations)) {
    throw new CompatibilityError('Translation package has an unsupported format.');
  }
  for (const entry of value.translations) {
    if (!entry || typeof entry.version !== 'string' || !entry.files || typeof entry.files !== 'object') {
      throw new CompatibilityError('Translation package contains an invalid version entry.');
    }
    for (const name of ['ion', 'dynamic', 'desktop']) {
      if (typeof entry.files[name] !== 'string') throw new CompatibilityError(`Translation package is missing ${name} for ${entry.version}.`);
    }
  }
  return value;
}

export function selectTranslationPackageEntry(appVersion, translationPackage) {
  const packageValue = validateTranslationPackage(translationPackage);
  const target = numericVersion(appVersion);
  const sorted = packageValue.translations
    .map((entry) => ({ entry, parts: numericVersion(entry.version) }))
    .sort((left, right) => compare(left.parts, right.parts));
  const compatible = sorted.filter(({ parts }) => compare(parts, target) <= 0);
  return (compatible.at(-1) ?? sorted[0])?.entry ?? null;
}

function numericVersion(value) {
  const parts = String(value).split('.');
  if (!parts.every((part) => /^\d+$/.test(part))) throw new CompatibilityError(`Unsupported Claude version: ${value}`);
  return [...parts.map(Number), 0, 0, 0].slice(0, 4);
}

function compare(left, right) {
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
