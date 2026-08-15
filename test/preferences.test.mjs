import assert from 'node:assert/strict';
import test from 'node:test';

import { CompatibilityError } from '../src/errors.mjs';
import { updateLocalePreference } from '../src/preferences.mjs';

test('updates locale without changing unrelated preferences', () => {
  assert.deepEqual(
    JSON.parse(updateLocalePreference('{"theme":"dark","locale":"en-US"}', 'zh-CN')),
    { theme: 'dark', locale: 'zh-CN' },
  );
});

test('rejects invalid preference JSON', () => {
  assert.throws(() => updateLocalePreference('{bad', 'zh-CN'), CompatibilityError);
});
