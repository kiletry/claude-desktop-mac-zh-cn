import assert from 'node:assert/strict';
import test from 'node:test';

import {
  digestJson,
  downloadTranslation,
  fetchUpstreamCatalog,
  validateTranslationJson,
} from '../src/upstream.mjs';

const response = (body, options = {}) => ({
  ok: true,
  status: 200,
  async json() { return body; },
  ...options,
});

test('discovers version directories and records the source commit', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    if (requestUrl.includes('/commits/')) return response({ sha: 'abc123' });
    return response([
      { name: '1.25927.0.0', type: 'dir' },
      { name: 'README.md', type: 'file' },
    ]);
  };

  const catalog = await fetchUpstreamCatalog({ fetchImpl });

  assert.equal(catalog.commit, 'abc123');
  assert.deepEqual(catalog.versions, ['1.25927.0.0']);
  assert.equal(calls.length, 2);
});

test('downloads and validates JSON files without executing content', async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /contents\/translated-zh-CN\/1\.25927\.0\.0\//);
    return response({
      encoding: 'base64',
      content: Buffer.from(JSON.stringify({ greeting: '你好', count: '{count}' })).toString('base64'),
    });
  };

  const result = await downloadTranslation({
    fetchImpl,
    commit: { sha: 'abc123', owner: 'owner', repo: 'repo', ref: 'master' },
    version: '1.25927.0.0',
  });

  assert.equal(result.files['ion-dist'].greeting, '你好');
  assert.match(result.digests['ion-dist'].sha256, /^[a-f0-9]{64}$/);
});

test('rejects invalid translation roots and values', () => {
  assert.throws(() => validateTranslationJson([], 'bad.json'), /object root/);
  assert.throws(() => validateTranslationJson({ count: 2 }, 'bad.json'), /string values/);
  assert.deepEqual(validateTranslationJson({ ok: 'yes' }, 'good.json'), { ok: 'yes' });
});

test('digestJson is stable for equivalent objects', () => {
  assert.equal(digestJson({ a: 1 }).sha256, digestJson({ a: 1 }).sha256);
  assert.equal(digestJson({ a: 1 }).bytes, Buffer.byteLength('{"a":1}'));
});
