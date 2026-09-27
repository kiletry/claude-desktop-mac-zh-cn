import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadCompatibleTranslation } from '../src/translation-source.mjs';

test('adds an optional GitHub token to upstream requests without exposing it in URLs', async () => {
  const requests = [];
  const response = (json) => ({ ok: true, json: async () => json });
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/commits/master')) return response({ sha: 'sha' });
    if (url.includes('/git/trees/sha')) return response({ tree: [
      { path: 'translated-zh-CN/1.0.0/ion-dist/zh-CN.json' },
      { path: 'translated-zh-CN/1.0.0/ion-dist/dynamic/zh-CN.json' },
      { path: 'translated-zh-CN/1.0.0/desktop-shell/zh-CN.json' },
    ] });
    return response({ encoding: 'base64', content: Buffer.from('{"hello":"你好"}').toString('base64') });
  };

  await downloadCompatibleTranslation('1.0.1', fetchImpl, { token: 'secret-token' });
  assert.equal(requests.length, 7);
  const upstreamRequests = requests.filter(({ url }) => url.includes('api.github.com'));
  assert.equal(upstreamRequests.length, 6);
  assert.ok(upstreamRequests.every(({ options }) => options.headers.Authorization === 'Bearer secret-token'));
  assert.ok(requests.every(({ url }) => !url.includes('secret-token')));
});
