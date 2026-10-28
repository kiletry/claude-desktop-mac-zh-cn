import assert from 'node:assert/strict';
import test from 'node:test';
import { updateIntegrityDigest } from '../src/asar-resources.mjs';

test('updates enabled Electron package-dictionary digest slots and preserves disabled slots', () => {
  const marker=Buffer.from('AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A');
  const enabled=Buffer.concat([marker,Buffer.from([1,1]),Buffer.alloc(32)]);
  const disabled=Buffer.concat([marker,Buffer.alloc(34)]);
  const input=Buffer.concat([enabled,disabled]);
  const integrity={'Resources/app.asar':{algorithm:'SHA256',hash:'abc'}};
  const out=updateIntegrityDigest(input,integrity);
  assert.equal(out.slots,1);
  // SHA-256 of literal concatenation Resources/app.asarSHA256abc.
  assert.equal(out.data.subarray(marker.length+2,marker.length+34).toString('hex'),'845ff6655965e9722858e62b5bac1cb2f8dd410376443ff1785b282b56d4f0c7');
  assert.deepEqual(out.data.subarray(enabled.length),disabled);
  assert.deepEqual(input.subarray(marker.length+2,marker.length+34),Buffer.alloc(32));
});
