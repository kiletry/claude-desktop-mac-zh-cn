import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from '@formatjs/icu-messageformat-parser';
import { LOCAL_CATALOGS } from '../src/local-catalogs.mjs';

// Message formatting is executable UI data. Translation must keep arguments,
// format types, selector keys, plural offsets and rich-text callbacks intact.
function signature(ast) {
  const parts = [];
  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === 0) continue;
      if (node.type === 8) { parts.push(`tag:${node.value}`); walk(node.children); continue; }
      if (node.type === 7) { parts.push('#'); continue; }
      parts.push(JSON.stringify({ type: node.type, value: node.value, style: node.style, offset: node.offset, pluralType: node.pluralType, options: node.options ? Object.keys(node.options).sort() : undefined }));
      if (node.options) for (const [key, option] of Object.entries(node.options)) { parts.push(`branch:${node.value}:${key}`); walk(option.value); }
    }
  }
  walk(ast);
  return parts.sort();
}

test('every local translation preserves ICU arguments, selectors, formatting, and rich tags', () => {
  for (const [name, catalog] of Object.entries(LOCAL_CATALOGS)) {
    for (const [id, pair] of Object.entries(catalog)) {
      assert.equal(pair.length, 2, `${name}/${id}`);
      const [from, to] = pair;
      assert.equal(typeof from, 'string', `${name}/${id}`);
      assert.equal(typeof to, 'string', `${name}/${id}`);
      assert.ok(to.trim(), `${name}/${id} is empty`);
      assert.deepEqual(signature(parse(to)), signature(parse(from)), `${name}/${id}: ${from}`);
      assert.deepEqual((to.match(/\$\d+/g) ?? []).sort(), (from.match(/\$\d+/g) ?? []).sort(), `${name}/${id}: positional arguments`);
    }
  }
});
