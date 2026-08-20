import { CompatibilityError, UserError } from './errors.mjs';
import { createHash } from 'node:crypto';
import { access, chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPackage, extractAll } from '@electron/asar';

import { downloadCompatibleTranslation } from './translation-source.mjs';

const SUPPORTED_LOCALE_ARRAY = '["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"]';
const CLONE_BUNDLE_IDENTIFIER = 'com.kiletry.claude-desktop-zh-cn';
const MINIMAL_CLONE_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>
`;

export function selectCloneTranslationVersion(appVersion, versions) {
  const target = numericVersion(appVersion);
  const candidates = versions
    .map((version) => ({ version, parts: numericVersion(version) }))
    .sort((left, right) => compareVersions(left.parts, right.parts));
  if (candidates.length === 0) {
    throw new CompatibilityError('No upstream Chinese translation versions are available.');
  }
  const compatible = candidates.filter(({ parts }) => compareVersions(parts, target) <= 0);
  return (compatible.at(-1) ?? candidates[0]).version;
}

export function validateTranslationPayloads(payloads) {
  if (payloads === null || typeof payloads !== 'object' || Array.isArray(payloads)) {
    throw new CompatibilityError('Translation payloads must be an object.');
  }
  for (const [name, payload] of Object.entries(payloads)) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new CompatibilityError(`Translation payload ${name} must be an object.`);
    }
    if (Object.values(payload).some((value) => typeof value !== 'string')) {
      throw new CompatibilityError(`Translation payload ${name} must contain only string values.`);
    }
  }
  return payloads;
}

export function buildCloneLauncherScript() {
  return '#!/bin/sh\n'
    + 'set -eu\n'
    + 'SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\n'
    + 'USER_DATA_DIR="${CLAUDE_DESKTOP_ZH_CN_USER_DATA_DIR:-$HOME/Library/Application Support/Claude Desktop zh-CN}"\n'
    + 'mkdir -p "$USER_DATA_DIR"\n'
    + 'CONFIG_PATH="$USER_DATA_DIR/config.json"\n'
    + 'if [ -f "$CONFIG_PATH" ]; then\n'
    + '  /usr/bin/plutil -replace locale -string zh-CN -- "$CONFIG_PATH"\n'
    + 'else\n'
    + '  printf \'{\\n\\t"locale": "zh-CN"\\n}\\n\' > "$CONFIG_PATH"\n'
    + 'fi\n'
    + 'export CLAUDE_USER_DATA_DIR="$USER_DATA_DIR"\n'
    + 'exec "$SCRIPT_DIR/Claude-bin" --user-data-dir "$USER_DATA_DIR" "$@"\n';
}

export function buildCloneEntitlements(originalEntitlements) {
  void originalEntitlements;
  return MINIMAL_CLONE_ENTITLEMENTS;
}

export function buildTranslationResourcePlan({ resourcesDir, sourceFiles, availableDirectories }) {
  const resourceDefinitions = [
    {
      source: 'ion',
      directory: resourcesDir,
      destination: `${resourcesDir}/zh-CN.json`,
    },
    {
      source: 'ion',
      directory: `${resourcesDir}/ion-dist/i18n`,
      destination: `${resourcesDir}/ion-dist/i18n/zh-CN.json`,
    },
    {
      source: 'dynamic',
      directory: `${resourcesDir}/ion-dist/i18n/dynamic`,
      destination: `${resourcesDir}/ion-dist/i18n/dynamic/zh-CN.json`,
    },
    {
      source: 'desktop',
      directory: `${resourcesDir}/desktop-shell/i18n`,
      destination: `${resourcesDir}/desktop-shell/i18n/zh-CN.json`,
    },
  ];
  const writes = [];
  const skipped = [];
  for (const definition of resourceDefinitions) {
    if (!availableDirectories.has(definition.directory)) {
      skipped.push({ source: definition.source, reason: 'destination-directory-missing' });
      continue;
    }
    if (typeof sourceFiles[definition.source] !== 'string') {
      throw new CompatibilityError(`Missing ${definition.source} translation resource.`);
    }
    writes.push({
      source: definition.source,
      destination: definition.destination,
      content: sourceFiles[definition.source],
    });
  }
  return { writes, skipped };
}

export function patchLocaleRegistry(source) {
  const targets = [
    `Bc=${SUPPORTED_LOCALE_ARRAY}`,
    `vv=${SUPPORTED_LOCALE_ARRAY}`,
  ];
  const matches = targets.flatMap((target) => [...source.matchAll(new RegExp(escapeRegExp(target), 'g'))
    .map((match) => ({ ...match, target }))]);
  if (matches.length !== 1) {
    throw new CompatibilityError(`Expected exactly one supported locale registry, found ${matches.length}.`);
  }
  const { index, target } = matches[0];
  const offset = index + target.length;
  return `${source.slice(0, offset - 1)},"zh-CN"${source.slice(offset - 1)}`;
}

export function patchLocaleAssets(assets) {
  const candidates = assets.filter(({ content }) =>
    content.includes(`Bc=${SUPPORTED_LOCALE_ARRAY}`) || content.includes(`vv=${SUPPORTED_LOCALE_ARRAY}`));
  if (candidates.length !== 1) {
    throw new CompatibilityError(`Expected exactly one locale registry asset, found ${candidates.length}.`);
  }
  return assets.map((asset) => asset.path === candidates[0].path
    ? { ...asset, content: patchLocaleRegistry(asset.content) }
    : asset);
}

export function patchLocaleRuntime(source) {
  const modernTargets = [
    {
      target: 'function u5e(e){try{',
      replacement: 'function u5e(e){e=`zh-CN`;try{',
      label: 'modern runtime locale loader',
    },
    {
      target: 'function d5e(e){return u5e(e)?(io.set(`locale`,e),!0):!1}',
      replacement: 'function d5e(e){return u5e(`zh-CN`)?(io.set(`locale`,`zh-CN`),!0):!1}',
      label: 'modern runtime locale request handler',
    },
    {
      target: 'u5e(io.get(`locale`,c5e()))',
      replacement: 'u5e(`zh-CN`)',
      label: 'modern runtime locale initialization',
    },
  ];
  if (modernTargets.every(({ target }) => source.includes(target))) {
    return modernTargets.reduce((value, { target, replacement }) => value.replace(target, replacement), source);
  }
  const replacements = [
    {
      target: 'function B9e(e){try{',
      replacement: 'function B9e(e){e=`zh-CN`;if(VS?.locale===e)return!0;try{',
      label: 'runtime locale loader',
    },
    {
      target: 'function V9e(e){return B9e(e)?(Sl.set(`locale`,e),!0):!1}',
      replacement: 'function V9e(e){return B9e(`zh-CN`)?(Sl.set(`locale`,`zh-CN`),!0):!1}',
      label: 'runtime locale request handler',
    },
    {
      target: 'B9e(Sl.get(`locale`,R9e()))',
      replacement: 'B9e(`zh-CN`)',
      label: 'runtime locale initialization',
    },
  ];
  let patched = source;
  for (const { target, replacement, label } of replacements) {
    const count = patched.split(target).length - 1;
    if (count !== 1) {
      throw new CompatibilityError(`Expected exactly one runtime locale patch target for ${label}, found ${count}.`);
    }
    patched = patched.replace(target, replacement);
  }
  return patched;
}

export async function findRuntimeLocaleAsset(buildDirectory) {
  const entries = await readdir(buildDirectory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^index\.chunk-.*\.js$/.test(entry.name)) continue;
    const path = join(buildDirectory, entry.name);
    const content = await readFile(path, 'utf8');
    if (content.includes('function B9e') && content.includes('function V9e')) candidates.push(path);
  }
  if (candidates.length !== 1) {
    throw new CompatibilityError(`Expected exactly one runtime locale asset, found ${candidates.length}.`);
  }
  return candidates[0];
}

export function patchNativeMenuLocale(source) {
  const target = 'function n$(){let e=await _Sn();return o.Menu.buildFromTemplate(e)}';
  const count = source.split(target).length - 1;
  if (count === 0) {
    const modernTarget = 'async function tQ(){let e=await BNn();return o.Menu.buildFromTemplate(e)}';
    if (source.split(modernTarget).length - 1 !== 1) {
      throw new CompatibilityError('Expected exactly one native menu locale target, found 0.');
    }
    const modernPatch = 'async function tQ(){let e=await BNn();const t={File:`文件`,Edit:`编辑`,View:`视图`,Window:`窗口`,Help:`帮助` ,"About Claude":`关于 Claude`,"Settings…":`设置…`,"Check for Updates…":`检查更新…`,"New Conversation":`新建对话`,"Show Main Window":`显示主窗口`,"Close Window":`关闭窗口`,"Copy URL":`复制网址`,"Reload This Page":`重新加载此页`,"Actual Size":`实际大小`,"Zoom In":`放大`,"Zoom Out":`缩小`,"Enter Full Screen":`进入全屏`,"Exit Full Screen":`退出全屏`,"Claude Help":`Claude 帮助`,"Get Support":`获取支持`,Quit:`退出`,Cancel:`取消`,Reset:`重置`,Restart:`重启`,"Show App":`显示应用`};const r={undo:`撤销`,redo:`重做`,cut:`剪切`,copy:`复制`,paste:`粘贴`,selectAll:`全选`,minimize:`最小化`,close:`关闭窗口`,front:`全部置于最前`,services:`服务`,hide:`隐藏 Claude`,hideOthers:`隐藏其他`,unhide:`显示全部`};const i=e=>{if(!e||typeof e!==`object`)return e;const n={...e};if(Array.isArray(e.submenu))n.submenu=e.submenu.map(i);if(typeof e.label===`string`)n.label=t[e.label]??e.label;else if(typeof e.role===`string`&&r[e.role])n.label=r[e.role];return n};return o.Menu.buildFromTemplate(e.map(i))}';
    return source.replace(modernTarget, modernPatch);
  }
  if (count !== 1) {
    throw new CompatibilityError(`Expected exactly one native menu locale target, found ${count}.`);
  }
  const nativeMenuPatch = [
    'function n$(){let e=await _Sn();',
    'const t={',
    'File:`文件`,' ,
    '"About Claude":`关于 Claude`,"Settings…":`设置…`,"Check for Updates…":`检查更新…`,"New Conversation":`新建对话`,"Open File…":`打开文件…`,',
    'Edit:`编辑`,Undo:`撤销`,Redo:`重做`,Cut:`剪切`,Copy:`复制`,Paste:`粘贴`,"Select All":`全选`,Find:`查找`,"Find Next":`查找下一个`,"Find Previous":`查找上一个`,',
    'View:`视图`,"Copy URL":`复制网址`,"Reload This Page":`重新加载此页`,Back:`后退`,Forward:`前进`,"Actual Size":`实际大小`,"Zoom In":`放大`,"Zoom In (indie cooler version)":`放大`,"Zoom Out":`缩小`,"Exit Full Screen":`退出全屏`,"Enter Full Screen":`进入全屏`,"Previous Tab":`上一个标签页`,"Next Tab":`下一个标签页`,',
    'Window:`窗口`,"Show Main Window":`显示主窗口`,"Close Window":`关闭窗口`,"Show App":`显示应用`,Quit:`退出`,',
    'Help:`帮助`,"Claude Help":`Claude 帮助`,"Get Support":`获取支持`,',
    '"Enable Developer Mode":`启用开发者模式`,"Enable Cowork VM Debug Logging":`启用 Cowork 虚拟机调试日志`,"Enable Cowork SDK Debugging":`启用 Cowork SDK 调试`,"Free Up Cowork Disk Space…":`释放 Cowork 磁盘空间…`,"Delete Cowork VM Bundle and Restart…":`删除 Cowork 虚拟机包并重启…`,"Delete Cowork VM Sessions and Restart…":`删除 Cowork 虚拟机会话并重启…`,Troubleshooting:`故障排除`,"Show Logs in Finder":`在 Finder 中显示日志`,"Show Cowork Session Data in Finder":`在 Finder 中显示 Cowork 会话数据`,"Copy Installation ID":`复制安装 ID`,"Generate Diagnostic Report":`生成诊断报告`,"Record Net Log (30s)":`记录网络日志（30 秒）`,"Disable Hardware Acceleration":`禁用硬件加速`,',
    '"Restart Required":`需要重启`,Later:`稍后`,"Restart Now":`立即重启`,"Import Claude Code CLI sessions…":`导入 Claude Code CLI 会话…`,"Clear Cache and Restart":`清除缓存并重启`,"Reset App Data…":`重置应用数据…`,Cancel:`取消`,Reset:`重置`,Restart:`重启`,',
    '"Enable":`启用`,"Don\'t Enable":`不启用`,OK:`好`};',
    'const r={undo:`撤销`,redo:`重做`,cut:`剪切`,copy:`复制`,paste:`粘贴`,selectAll:`全选`,minimize:`最小化`,close:`关闭窗口`,front:`全部置于最前`,services:`服务`,hide:`隐藏 Claude`,hideOthers:`隐藏其他`,unhide:`显示全部`};',
    'const i=(e)=>{if(!e||typeof e!==`object`)return e;const n={...e};if(Array.isArray(e.submenu))n.submenu=e.submenu.map(i);if(typeof e.label===`string`)n.label=t[e.label]??e.label;else if(typeof e.role===`string`&&r[e.role])n.label=r[e.role];return n;};',
    'return o.Menu.buildFromTemplate(e.map(i))}',
  ].join('');
  return source.replace(target, nativeMenuPatch);
}

export function buildWebTranslationMap(english, chinese) {
  if (english === null || typeof english !== 'object' || Array.isArray(english)
    || chinese === null || typeof chinese !== 'object' || Array.isArray(chinese)) {
    throw new CompatibilityError('Web translation catalogs must be objects.');
  }
  const map = {};
  for (const [key, from] of Object.entries(english)) {
    const to = chinese[key];
    if (typeof from !== 'string' || typeof to !== 'string' || from === to || map[from] !== undefined) continue;
    map[from] = to;
  }
  return map;
}

export function patchMainViewPreloadLocale(source, translations = {}) {
  const target = 'let e=require("electron"),t=require("electron/renderer");';
  const count = source.split(target).length - 1;
  if (count !== 1) {
    throw new CompatibilityError(`Expected exactly one main view preload locale target, found ${count}.`);
  }
  const translationMap = JSON.stringify(translations);
  const preloadPatch = [
    ';(()=>{try{',
    'const setLocale=()=>{try{window.localStorage.setItem(`locale`,`zh-CN`);window.localStorage.setItem(`spa:i18nEarlyCatalog`,`zh-CN`)}catch{}};',
    'setLocale();window.addEventListener(`DOMContentLoaded`,setLocale);window.addEventListener(`pageshow`,setLocale);',
    `const map=${translationMap};`,
    'const translate=(rootNode)=>{const walker=document.createTreeWalker(rootNode,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const parent=node.parentElement;if(!parent||/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(parent.tagName))continue;const raw=node.nodeValue,trimmed=raw.trim(),to=map[trimmed];if(to&&to!==trimmed){const offset=raw.indexOf(trimmed);node.nodeValue=raw.slice(0,offset)+to+raw.slice(offset+trimmed.length);}}rootNode.querySelectorAll?.("[placeholder],[aria-label],[title]").forEach((el)=>{for(const attr of ["placeholder","aria-label","title"]){const value=el.getAttribute(attr),to=map[value];if(to&&to!==value)el.setAttribute(attr,to);}});};',
    'const start=()=>{if(!document.body){setTimeout(start,0);return;}translate(document);if(!window.__claudeZhObserver){window.__claudeZhObserver=new MutationObserver(()=>translate(document));window.__claudeZhObserver.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["placeholder","aria-label","title"]});}};',
    'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();',
    '}catch{}})();',
  ].join('');
  return source.replace(target, `${target}${preloadPatch}`);
}

export function computeAsarHeaderIntegrity(archive) {
  const buffer = Buffer.isBuffer(archive) ? archive : Buffer.from(archive);
  if (buffer.length < 16) {
    throw new CompatibilityError('The app.asar archive is too small to contain a valid header.');
  }
  const headerLength = buffer.readUInt32LE(12);
  const headerStart = 16;
  const headerEnd = headerStart + headerLength;
  if (headerLength === 0 || headerEnd > buffer.length) {
    throw new CompatibilityError(`The app.asar header length is invalid: ${headerLength}.`);
  }
  return createHash('sha256').update(buffer.subarray(headerStart, headerEnd)).digest('hex');
}

const defaultExecFile = async (file, args, options = {}) => {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
};

export async function buildLocalizedClone({
  appDir,
  version,
  outputDir = '/Applications',
  fetchImpl = fetch,
  execFile = defaultExecFile,
  replace = false,
}) {
  const clonePath = join(outputDir, 'Claude 中文.app');
  if (clonePath === appDir) throw new UserError('The clone destination must differ from the official Claude.app.');
  if (await exists(clonePath) && !replace) {
    throw new UserError(`Clone already exists: ${clonePath}; pass --replace to rebuild it.`);
  }

  const upstream = await downloadCompatibleTranslation(version, fetchImpl);
  const payloads = Object.fromEntries(Object.entries(upstream.files).map(([name, text]) => {
    try {
      return [name, JSON.parse(text)];
    } catch (error) {
      throw new CompatibilityError(`Upstream ${name} translation is not valid JSON.`, { cause: error });
    }
  }));
  validateTranslationPayloads(payloads);

  await mkdir(outputDir, { recursive: true });
  const stagingPath = join(outputDir, `.Claude 中文.app.tmp-${process.pid}-${Date.now()}`);
  const entitlementsPath = join(outputDir, `.Claude 中文.entitlements-${process.pid}-${Date.now()}.plist`);
  try {
    await execFile('/usr/bin/ditto', ['--', appDir, stagingPath], { encoding: 'utf8' });
    const resourcesDir = join(stagingPath, 'Contents', 'Resources');
    const executableDir = join(stagingPath, 'Contents', 'MacOS');
    const executablePath = join(executableDir, 'Claude');
    const nativeExecutablePath = join(executableDir, 'Claude-bin');
    await rename(executablePath, nativeExecutablePath);
    await writeFile(executablePath, buildCloneLauncherScript(), { mode: 0o755 });
    await chmod(executablePath, 0o755);
    const availableDirectories = new Set();
    for (const directory of [
      resourcesDir,
      join(resourcesDir, 'ion-dist', 'i18n'),
      join(resourcesDir, 'ion-dist', 'i18n', 'dynamic'),
      join(resourcesDir, 'desktop-shell', 'i18n'),
    ]) {
      if (await isDirectory(directory)) availableDirectories.add(directory);
    }
    const resourcePlan = buildTranslationResourcePlan({
      resourcesDir,
      sourceFiles: upstream.files,
      availableDirectories,
    });
    await Promise.all(resourcePlan.writes.map(({ destination, content }) => writeFile(destination, content)));

    const assetsDir = join(resourcesDir, 'ion-dist', 'assets', 'v1');
    const assets = await readJavaScriptAssets(assetsDir);
    const patchedAssets = patchLocaleAssets(assets);
    const registryAsset = patchedAssets.find((asset, index) => asset.content !== assets[index].content);
    for (const asset of patchedAssets) {
      const original = assets.find(({ path }) => path === asset.path);
      if (asset.content !== original.content) await writeFile(asset.path, asset.content);
    }

    const infoPlist = join(stagingPath, 'Contents', 'Info.plist');
    const runtimeLocalePatched = await patchPackagedRuntime({
      appAsarPath: join(resourcesDir, 'app.asar'),
      resourcesDir,
      workingDir: outputDir,
      infoPlist,
      execFile,
    });
    await execFile('/usr/bin/plutil', ['-replace', 'CFBundleDisplayName', '-string', 'Claude 中文', '--', infoPlist], { encoding: 'utf8' });
    await execFile('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', CLONE_BUNDLE_IDENTIFIER, '--', infoPlist], { encoding: 'utf8' });
    const helperApps = await readHelperApps(join(stagingPath, 'Contents', 'Frameworks'));
    for (const helperApp of helperApps) {
      await execFile('/usr/bin/plutil', [
        '-replace', 'CFBundleIdentifier', '-string', `${CLONE_BUNDLE_IDENTIFIER}.helper`, '--', helperApp.infoPlist,
      ], { encoding: 'utf8' });
      await execFile('/usr/bin/codesign', [
        '--force', '--sign', '-', '--timestamp=none', '--preserve-metadata=entitlements', helperApp.appPath,
      ], { encoding: 'utf8' });
    }
    const manifest = {
      appVersion: version,
      translationVersion: upstream.version,
      sourceCommit: upstream.commit,
      writes: resourcePlan.writes.map(({ source, destination }) => ({
        source,
        destination: destination.slice(stagingPath.length + 1),
      })),
      skipped: resourcePlan.skipped,
      localeRegistryAsset: registryAsset?.path.slice(stagingPath.length + 1) ?? null,
      runtimeLocalePatched,
      webViewLocalePreloadPatched: runtimeLocalePatched,
      userDataDirectory: '~/Library/Application Support/Claude Desktop zh-CN',
    };
    await writeFile(
      join(stagingPath, 'Contents', 'Resources', 'claude-desktop-mac-zh-cn-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await writeFile(entitlementsPath, buildCloneEntitlements());
    await execFile('/usr/bin/codesign', [
      '--force', '--sign', '-', '--timestamp=none', '--entitlements', entitlementsPath, nativeExecutablePath,
    ], { encoding: 'utf8' });
    await execFile('/usr/bin/codesign', [
      '--force', '--sign', '-', '--timestamp=none', '--entitlements', entitlementsPath, stagingPath,
    ], { encoding: 'utf8' });
    await execFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', stagingPath], { encoding: 'utf8' });
    await rm(entitlementsPath, { force: true });

    const previousPath = `${clonePath}.previous-${process.pid}-${Date.now()}`;
    if (replace && await exists(clonePath)) await rename(clonePath, previousPath);
    try {
      await rename(stagingPath, clonePath);
      if (replace && await exists(previousPath)) await rm(previousPath, { recursive: true, force: true });
    } catch (error) {
      if (replace && await exists(previousPath)) await rename(previousPath, clonePath);
      throw error;
    }
    return {
      appPath: clonePath,
      translationVersion: upstream.version,
      sourceCommit: upstream.commit,
      manifest,
    };
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    await rm(entitlementsPath, { force: true });
    throw error;
  }
}

async function patchPackagedRuntime({ appAsarPath, resourcesDir, workingDir, infoPlist, execFile = defaultExecFile }) {
  if (!(await exists(appAsarPath))) return false;
  const extractionPath = join(workingDir, `.Claude 中文.asar-src-${process.pid}-${Date.now()}`);
  try {
    await extractAll(appAsarPath, extractionPath);
    const runtimePath = await findRuntimeLocaleAsset(join(extractionPath, '.vite', 'build'));
    const source = await readFile(runtimePath, 'utf8');
    await writeFile(runtimePath, patchNativeMenuLocale(patchLocaleRuntime(source)));
    const mainViewPath = join(extractionPath, '.vite', 'build', 'mainView.js');
    const mainViewSource = await readFile(mainViewPath, 'utf8');
    const englishCatalog = JSON.parse(await readFile(join(resourcesDir, 'ion-dist', 'i18n', 'en-US.json'), 'utf8'));
    const chineseCatalog = JSON.parse(await readFile(join(resourcesDir, 'ion-dist', 'i18n', 'zh-CN.json'), 'utf8'));
    await writeFile(mainViewPath, patchMainViewPreloadLocale(
      mainViewSource,
      buildWebTranslationMap(englishCatalog, chineseCatalog),
    ));
    await createPackage(extractionPath, appAsarPath);
    const hash = computeAsarHeaderIntegrity(await readFile(appAsarPath));
    await execFile('/usr/libexec/PlistBuddy', [
      '-c', `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`, infoPlist,
    ], { encoding: 'utf8' });
    return true;
  } finally {
    await rm(extractionPath, { recursive: true, force: true });
  }
}

async function readJavaScriptAssets(assetsDir) {
  const entries = await readdir(assetsDir, { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map(async (entry) => {
      const path = join(assetsDir, entry.name);
      return { path, content: await readFile(path, 'utf8') };
    }));
}

async function readHelperApps(frameworksDir) {
  const entries = await readdir(frameworksDir, { withFileTypes: true }).catch(() => []);
  const helpers = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue;
    const appPath = join(frameworksDir, entry.name);
    const infoPlist = join(appPath, 'Contents', 'Info.plist');
    if (await exists(infoPlist)) helpers.push({ appPath, infoPlist });
  }
  return helpers;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

function numericVersion(value) {
  const parts = String(value).split('.');
  if (!parts.every((part) => /^\d+$/.test(part))) {
    throw new CompatibilityError(`Unsupported Claude version: ${value}`);
  }
  return [...parts.map(Number), 0, 0, 0, 0].slice(0, 4);
}

function compareVersions(left, right) {
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
