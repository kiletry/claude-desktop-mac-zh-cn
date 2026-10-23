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

// Exercise the release builder's real merge precedence and pinned source downloads.
const { buildTranslationPackage, downloadTranslationSources } = await import('../scripts/build-translation-package.mjs');

test('builds release catalogs with upstream priority, local supplements, and exact provenance', () => {
  const value = buildTranslationPackage({
    upstream: { commit: 'ice-sha', version: '2.19675.0', files: { ion: '{"shared":"上游"}', dynamic: '{}', desktop: '{}' }, english: '{}' },
    reference: { commit: 'javaht-sha', files: { ion: '{"shared":"参考","fallback":"补充"}' } },
    packageVersion: 'v0.1.17',
  });
  assert.equal(value.packageVersion, 'v0.1.17');
  assert.equal(value.sources[1].commit, 'javaht-sha');
  assert.equal(JSON.parse(value.translations[0].files.ion).shared, '上游');
  assert.equal(JSON.parse(value.translations[0].files.ion).fallback, '补充');
  assert.equal(JSON.parse(value.translations[0].files.desktop)['+4ABv8PeZM'], '允许手机和 claude.ai 在此电脑上启动会话？');
});

test('downloads only complete version catalogs using resolved commits', async () => {
  const requests = [];
  const ice = 'a'.repeat(40), ref = 'b'.repeat(40);
  const sources = await downloadTranslationSources(async (url) => {
    requests.push(url);
    const json = url.includes('/commits/master') ? { sha: ice }
      : url.includes('/commits/main') ? { sha: ref }
        : url.includes('/git/trees/') ? { tree: [
          '2.0/ion-dist/zh-CN.json', '2.0/ion-dist/dynamic/zh-CN.json', '2.0/desktop-shell/zh-CN.json', '3.0/ion-dist/zh-CN.json',
        ].map((path) => ({ path: `translated-zh-CN/${path}` })) } : { encoding: 'base64', content: Buffer.from('{}').toString('base64') };
    return { ok: true, json: async () => json, text: async () => '{}' };
  });
  assert.equal(sources.upstream.version, '2.0');
  assert.equal(sources.reference.commit, ref);
  assert.equal(requests.length, 9);
  assert.ok(requests.filter((url) => url.includes('/contents/')).every((url) => url.includes(ice) || url.includes(ref)));
});
