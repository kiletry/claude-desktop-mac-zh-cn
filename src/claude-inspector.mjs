import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { CompatibilityError } from './errors.mjs';

const OFFICIAL_BUNDLE_ID = 'com.anthropic.claudefordesktop';

const defaultExecFile = async (file, args) => {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => execFile(file, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stdout, stderr }));
    else resolve({ stdout, stderr });
  }));
};

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

export async function inspectClaudeApp(appDir, { execFile = defaultExecFile } = {}) {
  const appStat = await stat(appDir).catch(() => null);
  if (!appStat?.isDirectory() || !appDir.endsWith('.app')) {
    throw new CompatibilityError(`Claude app directory not found: ${appDir}`);
  }
  const contentsDir = join(appDir, 'Contents');
  const resourcesDir = join(contentsDir, 'Resources');
  const i18nDir = join(resourcesDir, 'ion-dist', 'i18n');
  const assetsDir = join(resourcesDir, 'ion-dist', 'assets', 'v1');
  if (!await exists(join(contentsDir, 'Info.plist')) || !await exists(resourcesDir) || !await exists(i18nDir)) {
    throw new CompatibilityError(`Unsupported Claude app layout: ${appDir}`);
  }
  let info;
  try {
    const result = await execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', join(contentsDir, 'Info.plist')]);
    info = JSON.parse(result.stdout);
  } catch (error) {
    throw new CompatibilityError('Unable to read Claude Info.plist', { cause: error });
  }
  const version = info.CFBundleShortVersionString;
  if (typeof version !== 'string') throw new CompatibilityError('Claude Info.plist has no application version');
  const bundleId = info.CFBundleIdentifier;
  if (bundleId !== OFFICIAL_BUNDLE_ID) {
    throw new CompatibilityError(`Unsupported Claude bundle identifier: ${String(bundleId)}`);
  }
  let signing = { verified: false, output: '' };
  try {
    const result = await execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', appDir]);
    signing = { verified: true, output: result.stderr ?? '' };
  } catch (error) {
    signing = { verified: false, output: error.stderr ?? error.message ?? '' };
  }
  let gatekeeper = { accepted: false, output: '' };
  try {
    const result = await execFile('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', appDir]);
    gatekeeper = { accepted: true, output: result.stderr ?? result.stdout ?? '' };
  } catch (error) {
    gatekeeper = { accepted: false, output: error.stderr ?? error.message ?? '' };
  }
  const dynamicDir = join(i18nDir, 'dynamic');
  const desktopShellDir = join(resourcesDir, 'desktop-shell', 'i18n');
  return {
    appDir,
    bundleId,
    resourcesDir,
    version,
    layout: {
      i18nDir,
      assetsDir: await exists(assetsDir) ? assetsDir : null,
      dynamicDir: await exists(dynamicDir) ? dynamicDir : null,
      desktopShellDir: await exists(desktopShellDir) ? desktopShellDir : null,
    },
    signing,
    gatekeeper,
  };
}
