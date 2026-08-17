import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTranslationResourcePlan,
  patchLocaleRegistry,
  selectCloneTranslationVersion,
  validateTranslationPayloads,
} from '../src/localized-clone.mjs';

const translationVersions = [
  '1.12603.1.0',
  '1.28929.0.0',
  '1.30096.1.0',
];

const payloads = {
  ion: { home: '首页' },
  dynamic: { settings: '设置' },
  desktop: { menu: '菜单' },
};

test('selects the nearest lower translation for the installed Claude patch version', () => {
  assert.equal(
    selectCloneTranslationVersion('1.30096.5', translationVersions),
    '1.30096.1.0',
  );
});

test('validates all three upstream translation payloads as string maps', () => {
  assert.deepEqual(validateTranslationPayloads(payloads), payloads);
  assert.throws(
    () => validateTranslationPayloads({ ...payloads, dynamic: { broken: 42 } }),
    /string values/i,
  );
});

test('maps renderer and dynamic resources while recording an absent optional desktop-shell destination', () => {
  const plan = buildTranslationResourcePlan({
    resourcesDir: '/clone/Contents/Resources',
    sourceFiles: {
      ion: '{"home":"首页"}\n',
      dynamic: '{"settings":"设置"}\n',
      desktop: '{"menu":"菜单"}\n',
    },
    availableDirectories: new Set([
      '/clone/Contents/Resources/ion-dist/i18n',
      '/clone/Contents/Resources/ion-dist/i18n/dynamic',
    ]),
  });

  assert.deepEqual(plan.writes, [
    {
      source: 'ion',
      destination: '/clone/Contents/Resources/ion-dist/i18n/zh-CN.json',
      content: '{"home":"首页"}\n',
    },
    {
      source: 'dynamic',
      destination: '/clone/Contents/Resources/ion-dist/i18n/dynamic/zh-CN.json',
      content: '{"settings":"设置"}\n',
    },
  ]);
  assert.deepEqual(plan.skipped, [{
    source: 'desktop',
    reason: 'destination-directory-missing',
  }]);
});

test('patches exactly one supported locale registry and rejects ambiguous bundles', () => {
  const source = 'const Bc=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];';
  assert.equal(
    patchLocaleRegistry(source),
    'const Bc=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID","zh-CN"];',
  );
  assert.throws(() => patchLocaleRegistry('const Bc=["en-US","de-DE"];'), /exactly one/i);
  assert.throws(
    () => patchLocaleRegistry(`${source}\n${source}`),
    /exactly one/i,
  );
});
