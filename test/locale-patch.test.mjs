import assert from 'node:assert/strict';
import test from 'node:test';

import { CompatibilityError } from '../src/errors.mjs';
import { planLocaleRegistryPatch, planResourceDestinations } from '../src/locale-patch.mjs';

const LOCALES = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';
const LOCALE_MAP = '{"en-US":"en","de-DE":"de","fr-FR":"fr","ko-KR":"ko","ja-JP":"ja","es-419":"es","es-ES":"es","it-IT":"it","hi-IN":"hi","pt-BR":"pt","id-ID":"id"}';

test('adds zh-CN to one known locale array and map', () => {
  const result = planLocaleRegistryPatch(`const locales=${LOCALES};const labels=${LOCALE_MAP};`);
  assert.equal(result.changed, true);
  assert.match(result.text, /"id-ID","zh-CN"/);
  assert.match(result.text, /"id-ID":"id","zh-CN":"zh"/);
  assert.equal(result.kind, 'array+map');
});

test('is idempotent after zh-CN is already registered', () => {
  const patched = planLocaleRegistryPatch(`const locales=${LOCALES};`).text;
  assert.deepEqual(planLocaleRegistryPatch(patched), { changed: false, text: patched, kind: 'registered' });
});

test('rejects ambiguous locale arrays', () => {
  assert.throws(
    () => planLocaleRegistryPatch(`const first=${LOCALES};const second=${LOCALES};`),
    CompatibilityError,
  );
});

test('plans only destinations exposed by the local bundle', () => {
  assert.deepEqual(
    planResourceDestinations({
      i18nDir: '/app/ion-dist/i18n',
      desktopShellDir: null,
      dynamicDir: '/app/ion-dist/i18n/dynamic',
    }, { 'ion-dist': {}, 'desktop-shell': {}, dynamic: {} }),
    [
      { sourceKey: 'ion-dist', destination: '/app/ion-dist/i18n/zh-CN.json' },
      { sourceKey: 'dynamic', destination: '/app/ion-dist/i18n/dynamic/zh-CN.json' },
    ],
  );
});
