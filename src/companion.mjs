import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { downloadCompatibleTranslation } from './translation-source.mjs';

const execFileDefault = async (file, args, options = {}) => {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => execFile(file, args, options, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr })));
};

export function createOcrTranslationMap(englishMessages, chineseMessages) {
  const translations = {};
  for (const [key, source] of Object.entries(englishMessages)) {
    const target = chineseMessages[key];
    if (typeof source !== 'string' || typeof target !== 'string') continue;
    const normalizedSource = source.trim();
    const normalizedTarget = target.trim();
    if (!normalizedSource || !normalizedTarget || normalizedSource === normalizedTarget) continue;
    const lookupKey = normalizedSource.toLocaleLowerCase('en-US');
    if (translations[lookupKey] === undefined) translations[lookupKey] = normalizedTarget;
  }
  return translations;
}

export function companionAppPath(outputDir) { return join(outputDir, 'Claude Chinese Companion.app'); }

export async function buildCompanion({
  appDir,
  version,
  fetchImpl = fetch,
  execFile = execFileDefault,
  projectDir,
  outputDir,
}) {
  const upstream = appDir && version
    ? await downloadCompatibleTranslation(version, fetchImpl)
    : undefined;
  const ocrDictionaryPath = upstream
    ? await writeRefreshedOcrDictionary({ appDir, outputDir, englishToChinese: upstream.files.ion })
    : join(projectDir, 'Sources', 'CompanionCore', 'Resources', 'ocr-zh-CN.json');
  await execFile('/usr/bin/xcrun', ['swift', 'build', '-c', 'release'], { cwd: projectDir, encoding: 'utf8' });
  const appPath = companionAppPath(outputDir);
  const contents = join(appPath, 'Contents');
  await mkdir(join(contents, 'MacOS'), { recursive: true });
  await mkdir(join(contents, 'Resources'), { recursive: true });
  const binary = join(projectDir, '.build', 'arm64-apple-macosx', 'release', 'ClaudeChineseCompanion');
  await cp(binary, join(contents, 'MacOS', 'ClaudeChineseCompanion'));
  await cp(join(projectDir, 'Sources', 'CompanionCore', 'Resources', 'zh-CN.json'), join(contents, 'Resources', 'zh-CN.json'));
  await cp(ocrDictionaryPath, join(contents, 'Resources', 'ocr-zh-CN.json'));
  await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>ClaudeChineseCompanion</string><key>CFBundleIdentifier</key><string>com.kiletry.claude-chinese-companion</string><key>CFBundleName</key><string>Claude 中文伴侣</string><key>CFBundlePackageType</key><string>APPL</string><key>NSScreenCaptureUsageDescription</key><string>仅在 Claude 界面侧栏和工具栏上离线识别英文控件并显示中文覆盖层；不会处理聊天正文或输入框。</string></dict></plist>\n`);
  await execFile('/usr/bin/codesign', [
    '--force', '--sign', '-', '--timestamp=none',
    '--requirements', '=designated => identifier "com.kiletry.claude-chinese-companion"',
    appPath,
  ], { encoding: 'utf8' });
  return {
    appPath,
    executablePath: join(contents, 'MacOS', 'ClaudeChineseCompanion'),
    translationVersion: upstream?.version,
    sourceCommit: upstream?.commit,
  };
}

async function writeRefreshedOcrDictionary({ appDir, outputDir, englishToChinese }) {
  const englishPath = join(appDir, 'Contents', 'Resources', 'ion-dist', 'i18n', 'en-US.json');
  const englishMessages = JSON.parse(await readFile(englishPath, 'utf8'));
  const chineseMessages = JSON.parse(englishToChinese);
  const translations = createOcrTranslationMap(englishMessages, chineseMessages);
  const dictionaryPath = join(outputDir, 'ocr-zh-CN.json');
  await mkdir(outputDir, { recursive: true });
  await writeFile(dictionaryPath, `${JSON.stringify(translations)}\n`);
  return dictionaryPath;
}

export async function launchCompanion({ execFile = execFileDefault, appPath }) {
  await execFile('/usr/bin/open', ['-n', appPath], { encoding: 'utf8' });
}
