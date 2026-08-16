import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildCompanion, companionAppPath, createOcrTranslationMap } from '../src/companion.mjs';

test('creates OCR translations by matching official message keys', () => {
  assert.deepEqual(
    createOcrTranslationMap(
      { settings: 'Settings', duplicateSettings: 'settings', newChat: 'New conversation', untranslated: 'Claude' },
      { settings: '设置', duplicateSettings: '重复翻译', newChat: '新建对话', untranslated: 'Claude' },
    ),
    { settings: '设置', 'new conversation': '新建对话' },
  );
});

test('build refreshes the OCR dictionary for the installed Claude version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-companion-refresh-'));
  const projectDir = join(root, 'project');
  const outputDir = join(root, 'output');
  const appDir = join(root, 'Claude.app');
  await mkdir(join(projectDir, '.build', 'arm64-apple-macosx', 'release'), { recursive: true });
  await mkdir(join(projectDir, 'Sources', 'CompanionCore', 'Resources'), { recursive: true });
  await mkdir(join(appDir, 'Contents', 'Resources', 'ion-dist', 'i18n'), { recursive: true });
  await writeFile(join(projectDir, '.build', 'arm64-apple-macosx', 'release', 'ClaudeChineseCompanion'), 'binary');
  await writeFile(join(projectDir, 'Sources', 'CompanionCore', 'Resources', 'zh-CN.json'), '[]');
  await writeFile(join(projectDir, 'Sources', 'CompanionCore', 'Resources', 'ocr-zh-CN.json'), '{"Settings":"旧翻译"}');
  await writeFile(join(appDir, 'Contents', 'Resources', 'ion-dist', 'i18n', 'en-US.json'), '{"settings":"Settings"}');

  const response = (json) => ({ ok: true, json: async () => json });
  const fetchImpl = async (url) => {
    if (url.endsWith('/commits/master')) return response({ sha: 'commit-sha' });
    if (url.includes('/git/trees/commit-sha')) return response({ tree: [
      { path: 'translated-zh-CN/1.30096.1.0/ion-dist/zh-CN.json' },
      { path: 'translated-zh-CN/1.30096.1.0/ion-dist/dynamic/zh-CN.json' },
      { path: 'translated-zh-CN/1.30096.1.0/desktop-shell/zh-CN.json' },
    ] });
    if (url.includes('/contents/translated-zh-CN/')) {
      return response({ encoding: 'base64', content: Buffer.from('{"settings":"设置"}').toString('base64') });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await buildCompanion({
    appDir,
    version: '1.30096.5',
    projectDir,
    outputDir,
    fetchImpl,
    execFile: async () => ({ stdout: '', stderr: '' }),
  });

  assert.equal(result.translationVersion, '1.30096.1.0');
  assert.deepEqual(
    JSON.parse(await readFile(join(companionAppPath(outputDir), 'Contents', 'Resources', 'ocr-zh-CN.json'), 'utf8')),
    { settings: '设置' },
  );
});

test('build signs the complete companion bundle with its bundle identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-companion-'));
  const projectDir = join(root, 'project');
  const outputDir = join(root, 'output');
  await mkdir(join(projectDir, '.build', 'arm64-apple-macosx', 'release'), { recursive: true });
  await mkdir(join(projectDir, 'Sources', 'CompanionCore', 'Resources'), { recursive: true });
  await writeFile(join(projectDir, '.build', 'arm64-apple-macosx', 'release', 'ClaudeChineseCompanion'), 'binary');
  await writeFile(join(projectDir, 'Sources', 'CompanionCore', 'Resources', 'zh-CN.json'), '{}');
  await writeFile(join(projectDir, 'Sources', 'CompanionCore', 'Resources', 'ocr-zh-CN.json'), '{"Settings":"设置"}');

  const calls = [];
  await buildCompanion({
    projectDir,
    outputDir,
    execFile: async (file, args) => {
      calls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  assert.deepEqual(calls, [
    { file: '/usr/bin/xcrun', args: ['swift', 'build', '-c', 'release'] },
    {
      file: '/usr/bin/codesign',
      args: [
        '--force', '--sign', '-', '--timestamp=none',
        '--requirements', '=designated => identifier "com.kiletry.claude-chinese-companion"',
        companionAppPath(outputDir),
      ],
    },
  ]);
  const info = await readFile(join(companionAppPath(outputDir), 'Contents', 'Info.plist'), 'utf8');
  assert.match(info, /NSScreenCaptureUsageDescription/);
  assert.equal(
    await readFile(join(companionAppPath(outputDir), 'Contents', 'Resources', 'ocr-zh-CN.json'), 'utf8'),
    '{"Settings":"设置"}',
  );
});
