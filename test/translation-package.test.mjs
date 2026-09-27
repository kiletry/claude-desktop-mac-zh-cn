import assert from 'node:assert/strict';
import test from 'node:test';

import { selectTranslationPackageEntry, validateTranslationPackage } from '../src/translation-package.mjs';

const packageValue = {
  schemaVersion: 1,
  translations: [
    { version: '1.2.0', files: { ion: '{}', dynamic: '{}', desktop: '{}' } },
    { version: '1.5.0', files: { ion: '{}', dynamic: '{}', desktop: '{}' } },
  ],
};

test('selects the nearest compatible translation from a release package', () => {
  assert.equal(selectTranslationPackageEntry('1.5.3', packageValue).version, '1.5.0');
  assert.equal(selectTranslationPackageEntry('1.0.0', packageValue).version, '1.2.0');
});

test('rejects malformed release translation packages', () => {
  assert.throws(() => validateTranslationPackage({ schemaVersion: 2, translations: [] }), /unsupported format/i);
  assert.throws(() => validateTranslationPackage({ schemaVersion: 1, translations: [{ version: '1.0', files: {} }] }), /missing ion/i);
});
