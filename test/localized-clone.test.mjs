import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildLocalizedClone,
  buildCloneLauncherScript,
  buildCloneEntitlements,
  buildTranslationResourcePlan,
  computeAsarHeaderIntegrity,
  buildWebTranslationMap,
  patchNativeMenuLocale,
  patchMainViewPreloadLocale,
  patchLocaleRegistry,
  patchLocaleAssets,
  patchLocaleRuntime,
  findRuntimeLocaleAsset,
  selectCloneTranslationVersion,
  validateTranslationPayloads,
} from '../src/localized-clone.mjs';
import { createHash } from 'node:crypto';

const translationVersions = [
  '1.12603.1.0',
  '1.28929.0.0',
  '1.30096.1.0',
];

const payloads = {
  ion: { home: '首页' },
  dynamic: { settings: '设置' },
  desktop: { menu: '菜单' },
};

test('launches the clone with an isolated Electron user-data directory', () => {
  assert.equal(
    buildCloneLauncherScript(),
    '#!/bin/sh\nset -eu\nSCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nUSER_DATA_DIR="${CLAUDE_DESKTOP_ZH_CN_USER_DATA_DIR:-$HOME/Library/Application Support/Claude Desktop zh-CN}"\nmkdir -p "$USER_DATA_DIR"\nCONFIG_PATH="$USER_DATA_DIR/config.json"\nif [ -f "$CONFIG_PATH" ]; then\n  /usr/bin/plutil -replace locale -string zh-CN -- "$CONFIG_PATH"\nelse\n  printf \'{\\n\\t"locale": "zh-CN"\\n}\\n\' > "$CONFIG_PATH"\nfi\nexport CLAUDE_USER_DATA_DIR="$USER_DATA_DIR"\nexec "$SCRIPT_DIR/Claude-bin" --user-data-dir "$USER_DATA_DIR" "$@"\n',
  );
});

test('does not copy Apple team-bound identity entitlements into an ad-hoc clone', () => {
  const original = '<plist><dict><key>com.apple.application-identifier</key><string>Q6L2SF6YDW.com.anthropic.claudefordesktop</string><key>com.apple.developer.team-identifier</key><string>Q6L2SF6YDW</string><key>keychain-access-groups</key><array><string>Q6L2SF6YDW.com.anthropic.claude.webauthn</string></array><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>';
  const result = buildCloneEntitlements(original);
  assert.doesNotMatch(result, /com\.apple\.application-identifier/);
  assert.doesNotMatch(result, /com\.apple\.developer\.team-identifier/);
  assert.doesNotMatch(result, /keychain-access-groups/);
  assert.doesNotMatch(result, /Q6L2SF6YDW\.com\.anthropic\.claude\.webauthn/);
  assert.match(result, /com\.apple\.security\.cs\.allow-jit/);
});

test('selects the nearest lower translation for the installed Claude patch version', () => {
  assert.equal(
    selectCloneTranslationVersion('1.30096.5', translationVersions),
    '1.30096.1.0',
  );
});

test('validates all three upstream translation payloads as string maps', () => {
  assert.deepEqual(validateTranslationPayloads(payloads), payloads);
  assert.throws(
    () => validateTranslationPayloads({ ...payloads, dynamic: { broken: 42 } }),
    /string values/i,
  );
});

test('maps renderer and dynamic resources while recording an absent optional desktop-shell destination', () => {
  const plan = buildTranslationResourcePlan({
    resourcesDir: '/clone/Contents/Resources',
    sourceFiles: {
      ion: '{"home":"首页"}\n',
      dynamic: '{"settings":"设置"}\n',
      desktop: '{"menu":"菜单"}\n',
    },
    availableDirectories: new Set([
      '/clone/Contents/Resources',
      '/clone/Contents/Resources/ion-dist/i18n',
      '/clone/Contents/Resources/ion-dist/i18n/dynamic',
    ]),
  });

  assert.deepEqual(plan.writes, [
    {
      source: 'ion',
      destination: '/clone/Contents/Resources/zh-CN.json',
      content: '{"home":"首页"}\n',
    },
    {
      source: 'ion',
      destination: '/clone/Contents/Resources/ion-dist/i18n/zh-CN.json',
      content: '{"home":"首页"}\n',
    },
    {
      source: 'dynamic',
      destination: '/clone/Contents/Resources/ion-dist/i18n/dynamic/zh-CN.json',
      content: '{"settings":"设置"}\n',
    },
  ]);
  assert.deepEqual(plan.skipped, [{
    source: 'desktop',
    reason: 'destination-directory-missing',
  }]);
});

test('patches exactly one supported locale registry and rejects ambiguous bundles', () => {
  const source = 'const Bc=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];';
  assert.equal(
    patchLocaleRegistry(source),
    'const Bc=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID","zh-CN"];',
  );
  assert.throws(() => patchLocaleRegistry('const Bc=["en-US","de-DE"];'), /exactly one/i);
  assert.throws(
    () => patchLocaleRegistry(`${source}\n${source}`),
    /exactly one/i,
  );
});

test('patches the renamed locale registry used by newer Claude bundles', () => {
  const source = 'var vv=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];';
  assert.match(patchLocaleRegistry(source), /vv=\["en-US".*"zh-CN"\]/);
  assert.equal(patchLocaleAssets([{ path: 'shared-2.js', content: source }])[0].content.includes('"zh-CN"'), true);
});

test('patches only the one asset that owns the supported locale registry', () => {
  const source = 'const Bc=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];';
  const result = patchLocaleAssets([
    { path: 'shared-2.js', content: source },
    { path: 'other.js', content: 'const value = "en-US";' },
  ]);
  assert.equal(result.find(({ path }) => path === 'shared-2.js').content, `${source.slice(0, -2)},"zh-CN"];`);
  assert.equal(result.find(({ path }) => path === 'other.js').content, 'const value = "en-US";');
  assert.throws(
    () => patchLocaleAssets([{ path: 'a.js', content: 'const value = "en-US";' }]),
    /exactly one/i,
  );
});

test('forces the packaged runtime to keep the Chinese locale after web app requests', () => {
  const source = 'function B9e(e){try{let t=z9e(e);return D.debug(`Switching to locale "%s"`,e),VS=t,F9e?.next(t),!0}catch(t){return D.error(`Failed to load locale ${e}: %o`,{error:t}),!1}}function V9e(e){return B9e(e)?(Sl.set(`locale`,e),!0):!1}function H9e(){if(!VS){try{VS=z9e(`en-US`)}catch(e){D.error(`Failed to load fallback en-US locale; using empty messages: %o`,{error:e}),VS=i9e({locale:`en-US`,messages:{}},P9e)}F9e=new Hi.BehaviorSubject(VS);try{B9e(Sl.get(`locale`,R9e()))}catch(e){D.error(`Failed to determine best locale; keeping en-US fallback: %o`,{error:e})}}}';
  const result = patchLocaleRuntime(source);
  assert.match(result, /function B9e\(e\)\{e=`zh-CN`;if\(VS\?\.locale===e\)return!0;/);
  assert.match(result, /function V9e\(e\)\{return B9e\(`zh-CN`\)\?\(Sl\.set\(`locale`,`zh-CN`\),!0\):!1\}/);
  assert.match(result, /try\{B9e\(`zh-CN`\)\}/);
  assert.throws(() => patchLocaleRuntime('function V9e(e){}'), /runtime locale patch target/i);
});

test('patches the renamed runtime functions used by Claude 1.32885', () => {
  const source = 'function u5e(e){try{let t=l5e(e);return D.debug(`Switching to locale "%s"`,e),Oy=t,a5e?.next(t),!0}catch(t){return!1}}function d5e(e){return u5e(e)?(io.set(`locale`,e),!0):!1}function f5e(){u5e(io.get(`locale`,c5e()))}';
  const result = patchLocaleRuntime(source);
  assert.match(result, /u5e\(e\)\{e=`zh-CN`/);
  assert.match(result, /d5e\(e\)\{return u5e\(`zh-CN`\)/);
  assert.match(result, /f5e\(\)\{u5e\(`zh-CN`\)\}/);
});

test('finds the renamed runtime locale chunk in newer Claude bundles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-runtime-asset-'));
  await writeFile(join(root, 'index.chunk-newhash.js'), 'function B9e(e){} function V9e(e){}');
  await writeFile(join(root, 'index.chunk-other.js'), 'function other(){}');
  assert.equal(await findRuntimeLocaleAsset(root), join(root, 'index.chunk-newhash.js'));
});

test('computes Electron ASAR integrity from the packaged JSON header', () => {
  const header = Buffer.from('{"files":{}}');
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(header.length, 12);
  const archive = Buffer.concat([prefix, header, Buffer.from('payload')]);
  const expected = createHash('sha256').update(header).digest('hex');
  assert.equal(computeAsarHeaderIntegrity(archive), expected);
});

test('seeds the main Claude web view with the Chinese locale before page scripts run', () => {
  const source = 'let e=require("electron"),t=require("electron/renderer");function n(){}';
  const result = patchMainViewPreloadLocale(source);
  assert.match(result, /localStorage\.setItem\(`locale`,`zh-CN`\)/);
  assert.match(result, /localStorage\.setItem\(`spa:i18nEarlyCatalog`,`zh-CN`\)/);
  assert.match(result, /createTreeWalker/);
  assert.match(result, /MutationObserver/);
  assert.match(result, /DOMContentLoaded/);
  assert.throws(() => patchMainViewPreloadLocale('function n(){}'), /main view preload locale/i);
});

test('builds a deterministic English-to-Chinese web text map', () => {
  assert.deepEqual(buildWebTranslationMap(
    { first: 'Home', second: 'Code', third: 'Same' },
    { first: '首页', second: '代码', third: 'Same' },
  ), { Home: '首页', Code: '代码' });
});

test('patches native macOS menus and role-generated submenu labels', () => {
  const source = 'function n$(){let e=await _Sn();return o.Menu.buildFromTemplate(e)}';
  const result = patchNativeMenuLocale(source);
  assert.match(result, /File:`文件`/);
  assert.match(result, /"About Claude":`关于 Claude`/);
  assert.match(result, /"Settings…":`设置…`/);
  assert.match(result, /"Check for Updates…":`检查更新…`/);
  assert.match(result, /"Copy URL":`复制网址`/);
  assert.match(result, /"New Conversation":`新建对话`/);
  assert.match(result, /undo:`撤销`/);
  assert.match(result, /minimize:`最小化`/);
  assert.match(result, /hideOthers:`隐藏其他`/);
  assert.throws(() => patchNativeMenuLocale('function n$(){}'), /native menu locale/i);
});

test('builds a separately signed clone without changing the official source bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-localized-clone-'));
  const appDir = join(root, 'Claude.app');
  const outputDir = join(root, 'Applications');
  const resourcesDir = join(appDir, 'Contents', 'Resources');
  const registry = 'const Bc=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];';
  await mkdir(join(resourcesDir, 'ion-dist', 'i18n', 'dynamic'), { recursive: true });
  await mkdir(join(resourcesDir, 'ion-dist', 'assets', 'v1'), { recursive: true });
  await mkdir(join(appDir, 'Contents', 'MacOS'), { recursive: true });
  await mkdir(join(appDir, 'Contents', 'Frameworks', 'Claude Helper.app', 'Contents'), { recursive: true });
  await writeFile(join(appDir, 'Contents', 'Info.plist'), JSON.stringify({
    CFBundleName: 'Claude',
    CFBundleDisplayName: 'Claude',
    CFBundleIdentifier: 'com.anthropic.claudefordesktop',
  }));
  await writeFile(join(appDir, 'Contents', 'Frameworks', 'Claude Helper.app', 'Contents', 'Info.plist'), JSON.stringify({
    CFBundleIdentifier: 'com.anthropic.claudefordesktop.helper',
  }));
  await writeFile(join(resourcesDir, 'ion-dist', 'assets', 'v1', 'shared-2.js'), registry);
  await writeFile(join(appDir, 'Contents', 'MacOS', 'Claude'), 'native binary');
  const sourceRegistry = await readFile(join(resourcesDir, 'ion-dist', 'assets', 'v1', 'shared-2.js'), 'utf8');

  const response = (json) => ({ ok: true, json: async () => json });
  const fetchImpl = async (url) => {
    if (url.endsWith('/commits/master')) return response({ sha: 'commit-sha' });
    if (url.includes('/git/trees/commit-sha')) return response({ tree: [
      { path: 'translated-zh-CN/1.30096.1.0/ion-dist/zh-CN.json' },
      { path: 'translated-zh-CN/1.30096.1.0/ion-dist/dynamic/zh-CN.json' },
      { path: 'translated-zh-CN/1.30096.1.0/desktop-shell/zh-CN.json' },
    ] });
    if (url.includes('/contents/translated-zh-CN/')) {
      return response({ encoding: 'base64', content: Buffer.from('{"hello":"你好"}').toString('base64') });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const calls = [];
  const entitlementSnapshots = [];
  const execFile = async (file, args) => {
    calls.push({ file, args });
    if (file === '/usr/bin/ditto') {
      await cp(args[1], args[2], { recursive: true });
    } else if (file === '/usr/bin/plutil') {
      const plistPath = args.at(-1);
      const plist = JSON.parse(await readFile(plistPath, 'utf8'));
      plist[args[1]] = args[3];
      await writeFile(plistPath, JSON.stringify(plist));
    } else if (file === '/usr/bin/codesign' && args.includes('--entitlements')) {
      const entitlementsPath = args[args.indexOf('--entitlements') + 1];
      entitlementSnapshots.push(await readFile(entitlementsPath, 'utf8'));
    }
    return { stdout: '', stderr: '' };
  };

  const result = await buildLocalizedClone({
    appDir,
    version: '1.30096.5',
    outputDir,
    fetchImpl,
    execFile,
  });
  assert.equal(result.translationVersion, '1.30096.1.0');
  assert.equal(result.sourceCommit, 'commit-sha');
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Info.plist'), 'utf8')), {
    CFBundleName: 'Claude',
    CFBundleDisplayName: 'Claude 中文',
    CFBundleIdentifier: 'com.kiletry.claude-desktop-zh-cn',
  });
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Frameworks', 'Claude Helper.app', 'Contents', 'Info.plist'), 'utf8')), {
    CFBundleIdentifier: 'com.kiletry.claude-desktop-zh-cn.helper',
  });
  assert.equal(
    await readFile(join(result.appPath, 'Contents', 'MacOS', 'Claude'), 'utf8'),
    buildCloneLauncherScript(),
  );
  assert.equal(await readFile(join(result.appPath, 'Contents', 'MacOS', 'Claude-bin'), 'utf8'), 'native binary');
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Resources', 'ion-dist', 'i18n', 'zh-CN.json'), 'utf8')), { hello: '你好' });
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Resources', 'ion-dist', 'i18n', 'dynamic', 'zh-CN.json'), 'utf8')), { hello: '你好' });
  assert.match(await readFile(join(result.appPath, 'Contents', 'Resources', 'ion-dist', 'assets', 'v1', 'shared-2.js'), 'utf8'), /"zh-CN"/);
  assert.equal(await readFile(join(resourcesDir, 'ion-dist', 'assets', 'v1', 'shared-2.js'), 'utf8'), sourceRegistry);
  assert.deepEqual(result.manifest.writes.map(({ source, destination }) => ({ source, destination })), [
    { source: 'ion', destination: 'Contents/Resources/zh-CN.json' },
    { source: 'ion', destination: 'Contents/Resources/ion-dist/i18n/zh-CN.json' },
    { source: 'dynamic', destination: 'Contents/Resources/ion-dist/i18n/dynamic/zh-CN.json' },
  ]);
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Resources', 'zh-CN.json'), 'utf8')), { hello: '你好' });
  assert.equal(result.manifest.localeRegistryAsset, 'Contents/Resources/ion-dist/assets/v1/shared-2.js');
  assert.deepEqual(result.manifest.skipped, [{ source: 'desktop', reason: 'destination-directory-missing' }]);
  assert.equal(entitlementSnapshots.length, 2);
  assert.ok(entitlementSnapshots.every((snapshot) => /com\.apple\.security\.cs\.allow-jit/.test(snapshot)));
  assert.equal(calls.some(({ file, args }) => file === '/usr/bin/codesign' && args.some((arg) => arg === appDir)), false);
});
