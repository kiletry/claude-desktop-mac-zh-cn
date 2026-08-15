import { mkdir, cp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const execFileDefault = async (file, args, options = {}) => {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => execFile(file, args, options, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr })));
};

export function companionAppPath(outputDir) { return join(outputDir, 'Claude Chinese Companion.app'); }

export async function buildCompanion({ execFile = execFileDefault, projectDir, outputDir }) {
  await execFile('/usr/bin/xcrun', ['swift', 'build', '-c', 'release'], { cwd: projectDir, encoding: 'utf8' });
  const appPath = companionAppPath(outputDir);
  const contents = join(appPath, 'Contents');
  await mkdir(join(contents, 'MacOS'), { recursive: true });
  await mkdir(join(contents, 'Resources'), { recursive: true });
  const binary = join(projectDir, '.build', 'arm64-apple-macosx', 'release', 'ClaudeChineseCompanion');
  await cp(binary, join(contents, 'MacOS', 'ClaudeChineseCompanion'));
  await cp(join(projectDir, 'Sources', 'CompanionCore', 'Resources', 'zh-CN.json'), join(contents, 'Resources', 'zh-CN.json'));
  await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>ClaudeChineseCompanion</string><key>CFBundleIdentifier</key><string>com.kiletry.claude-chinese-companion</string><key>CFBundleName</key><string>Claude 中文伴侣</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>\n`);
  return { appPath, executablePath: join(contents, 'MacOS', 'ClaudeChineseCompanion') };
}

export async function launchCompanion({ execFile = execFileDefault, appPath }) {
  await execFile('/usr/bin/open', ['-n', appPath], { encoding: 'utf8' });
}
