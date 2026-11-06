import assert from 'node:assert/strict';
import test from 'node:test';
import { supplementLocalCatalog, supplementTranslationEntry } from '../src/local-catalogs.mjs';
import { buildWebTranslationMap } from '../src/localized-clone.mjs';

const catalogs = { ion: { old: ['A new message', '新消息'], reused: ['Original message', '原文'] }, desktop: { old: ['Trust this folder?', '信任此文件夹？'] } };

test('fills gaps by exact English text after IDs rotate while preserving upstream translations', () => {
  assert.deepEqual(supplementLocalCatalog('ion', { rotated: 'A new message', reused: 'Changed message', keep: 'A new message', empty: 'A new message' }, { reused: 'Changed message', keep: '上游译文', empty: ' ' }, catalogs), {
    reused: 'Changed message', keep: '上游译文', empty: '新消息', rotated: '新消息',
  });
  assert.deepEqual(supplementLocalCatalog('desktop', { rotated: 'Trust this folder?' }, {}, catalogs), { rotated: '信任此文件夹？' });
});

test('public packages include local translations and their English baseline without replacing upstream Chinese', () => {
  const entry = supplementTranslationEntry({ version: '3.0', files: { ion: '{"old":"上游译文"}', dynamic: '{}', desktop: '{}' }, english: '{"legacy":"Older English"}' }, catalogs);
  assert.deepEqual(JSON.parse(entry.files.ion), { old: '上游译文', reused: '原文' });
  assert.deepEqual(JSON.parse(entry.files.desktop), { old: '信任此文件夹？' });
  assert.deepEqual(JSON.parse(entry.english), { legacy: 'Older English', old: 'A new message', reused: 'Original message' });
});

test('web preload fallback uses project local translations for current and rotated IDs', () => {
  const map = buildWebTranslationMap({ rotated: 'Creating section', desktop: 'Let your phone and claude.ai start sessions on this computer?' }, {});
  assert.equal(map['Creating section'], '正在创建分区');
  assert.equal(buildWebTranslationMap({ rotated: 'Creating section' }, { rotated: '上游译文' })['Creating section'], '上游译文');
  // The desktop catalog must stay separate from the frontend fallback.
  assert.equal(map['Let your phone and claude.ai start sessions on this computer?'], undefined);
});

test('uses Claude 4.29 supplements in both frontend fallback and packaged desktop catalogs', () => {
  assert.equal(buildWebTranslationMap({ rotated: 'Stop sharing with {org}' }, {})['Stop sharing with {org}'], '停止与 {org} 共享');
  const entry = supplementTranslationEntry({ files: { ion: '{}', dynamic: '{}', desktop: '{}' }, english: '{}' });
  assert.equal(JSON.parse(entry.files.ion)['++XvhBJqfj'], '停止与 {org} 共享');
  assert.ok(JSON.parse(entry.files.desktop)['++/vyEBwJg']);
});

test('includes Claude 4.16336 frontend, desktop and dynamic supplements', () => {
  const entry = supplementTranslationEntry({ files: { ion: '{}', dynamic: '{}', desktop: '{}' }, english: '{}' });
  assert.equal(JSON.parse(entry.files.ion)['++K+2h7FZc'], '以参与者身份打开');
  assert.equal(JSON.parse(entry.files.desktop)['0P+5YSBjZO'], '切换分支？');
  assert.equal(JSON.parse(entry.files.dynamic)['XPiJIxyAVt'], '推荐');
  assert.equal(buildWebTranslationMap({ rotated: 'Open as participant' }, {})['Open as participant'], '以参与者身份打开');
});

test('includes Claude 4.23118 import messages in public packages and rotated frontend IDs', () => {
  const entry = supplementTranslationEntry({ files: { ion: '{}', dynamic: '{}', desktop: '{}' }, english: '{}' });
  const from = 'This file has nothing to import. Choose another file.';
  const to = '此文件没有可导入的内容。请选择其他文件。';
  assert.equal(JSON.parse(entry.files.ion)['++CUhQojd6'], to);
  assert.equal(JSON.parse(entry.english)['++CUhQojd6'], from);
  assert.equal(JSON.parse(entry.files.desktop)['Uv4EenEj80'], '仅导入会话');
  assert.equal(buildWebTranslationMap({ rotated: from }, {})[from], to);
});
