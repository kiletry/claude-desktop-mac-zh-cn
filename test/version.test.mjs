import assert from 'node:assert/strict';
import test from 'node:test';

import { CompatibilityError } from '../src/errors.mjs';
import {
  compareVersions,
  normalizeClaudeVersion,
  selectTranslationVersion,
} from '../src/version.mjs';

test('normalizes a Claude three-part version to upstream form', () => {
  assert.deepEqual(normalizeClaudeVersion('1.25927.0'), {
    upstream: '1.25927.0.0',
    parts: [1, 25927, 0, 0],
  });
});

test('compares version tuples numerically', () => {
  assert.equal(compareVersions('1.100.0.0', '1.99.0.0'), 1);
  assert.equal(compareVersions('1.99.0.0', '1.100.0.0'), -1);
  assert.equal(compareVersions('1.99.0.0', '1.99.0'), 0);
});

test('requires exact translation unless nearest fallback is explicit', () => {
  assert.throws(
    () => selectTranslationVersion('1.30097.0', ['1.30096.1.0'], { allowNearest: false }),
    CompatibilityError,
  );
  assert.deepEqual(
    selectTranslationVersion('1.30097.0', ['1.30096.1.0'], { allowNearest: true }),
    { version: '1.30096.1.0', exact: false, relation: 'older' },
  );
});

test('selects the highest compatible lower version', () => {
  assert.deepEqual(
    selectTranslationVersion('1.30097.0', ['1.2.0.0', '1.30096.1.0', '1.400.0.0'], { allowNearest: true }),
    { version: '1.30096.1.0', exact: false, relation: 'older' },
  );
});
