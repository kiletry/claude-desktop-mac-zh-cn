import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGeneratorEvent,
  redactSensitiveText,
  serializeGeneratorEvent,
} from '../src/generator-events.mjs';

test('generator events have a stable JSON-lines shape and redact secrets', () => {
  const event = createGeneratorEvent({
    event: 'error',
    stage: 'inspection',
    message: 'request failed with apiKey=sk-live-secret and Bearer abc123',
    value: 'token: top-secret',
  });

  assert.deepEqual(Object.keys(event), ['event', 'stage', 'message', 'value']);
  assert.equal(JSON.stringify(event).includes('sk-'), false);
  assert.equal(JSON.stringify(event).includes('top-secret'), false);
  assert.deepEqual(JSON.parse(serializeGeneratorEvent(event)), event);
  assert.match(redactSensitiveText('authorization: Bearer abc123'), /\[REDACTED\]/);
});

test('redaction masks common credential formats without changing safe text', () => {
  const text = 'apiKey=abc token:xyz authorization Bearer qqq sk-abc123 safe';
  const redacted = redactSensitiveText(text);
  assert.equal(redacted.includes('abc'), false);
  assert.equal(redacted.includes('xyz'), false);
  assert.equal(redacted.includes('qqq'), false);
  assert.equal(redacted.includes('sk-abc123'), false);
  assert.match(redacted, /safe$/);
});
