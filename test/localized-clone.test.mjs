import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildLocalizedClone,
  buildCloneLauncherScript,
  buildCloneEntitlements,
  buildTranslationResourcePlan,
  computeAsarHeaderIntegrity,
  collectUntranslatedInterfaceMessages,
  buildWebTranslationMap,
  extractDefaultMessages,
  patchNativeMenuLocale,
  patchMainViewPreloadLocale,
  patchLocaleRegistry,
  patchLocaleAssets,
  patchLocaleRuntime,
  findRuntimeLocaleAsset,
  selectCloneTranslationVersion,
  validateTranslationPayloads,
} from '../src/localized-clone.mjs';
import { INTERFACE_PASSTHROUGHS } from '../src/settings-translations.mjs';
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

test('patches a locale registry after Claude changes its minified variable name', () => {
  const source = 'var xu=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];function Mu(e){return e&&xu.includes(e)?e:void 0}';
  const patched = patchLocaleAssets([{ path: 'shared-2-BF65-y49.js', content: source }]);
  assert.match(patched[0].content, /xu=\["en-US".*"zh-CN"\]/);
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

test('patches the Claude 1.34493 runtime after minified symbol rotation', () => {
  const source = 'function DXe(e){try{let t=EXe(e);return D.debug(`Switching to locale "%s"`,e),kg=t,Ag?.next(t),!0}catch(t){return D.error(`Failed to load locale ${e}: %o`,{error:t}),!1}}function OXe(e){return DXe(e)?(wo.set(`locale`,e),!0):!1}function kXe(){if(!kg){try{kg=EXe(`en-US`)}catch(e){kg=YYe({locale:`en-US`,messages:{}},SXe)}Ag=new na.BehaviorSubject(kg);try{DXe(wo.get(`locale`,TXe()))}catch(e){D.error(`Failed to determine best locale; keeping en-US fallback: %o`,{error:e})}}}';
  const result = patchLocaleRuntime(source);
  assert.match(result, /function DXe\(e\)\{e=`zh-CN`;try\{/);
  assert.match(result, /function OXe\(e\)\{return DXe\(`zh-CN`\)\?\(wo\.set\(`locale`,`zh-CN`\),!0\):!1\}/);
  assert.match(result, /try\{DXe\(`zh-CN`\)\}/);
});

test('patches the Claude 1.40609 runtime with locale availability guards', () => {
  const source = 'function $0e(e){return load(e)}function e2e(e){try{let t=$0e(e);return P.debug(`Switching to locale "%s"`,e),ag=t,K0e?.next(t),!0}catch(t){return P.error(`Failed to load locale ${e}: %o`,{error:t}),!1}}function t2e(e){return Q0e(e)?e2e(e)?(Va.set(`locale`,e),!0):!1:(P.warn(`Rejected locale change to unavailable locale %o`,{locale:e}),!1)}function n2e(){if(!ag){K0e=new Aa.BehaviorSubject(ag);try{let e=Va.get(`locale`);e2e(e!==void 0&&Q0e(e)?e:X0e())}catch(e){P.error(`Failed to determine best locale; keeping en-US fallback: %o`,{error:e})}}}}';
  const result = patchLocaleRuntime(source);
  assert.match(result, /function e2e\(e\)\{e=`zh-CN`;try\{/);
  assert.match(result, /Q0e\(e\)\?e2e\(`zh-CN`\)\?\(Va\.set\(`locale`,`zh-CN`\),!0\)/);
  assert.match(result, /e2e\(`zh-CN`\)\}catch/);
});

test('patches the Claude 1.44121 runtime with quoted locale calls', () => {
  const source = 'function w3e(e){return B4e({locale:e,messages:JSON.parse((0,Gh.readFileSync)(n.default.join(v3e(),`${e}.json`),"utf8"))},g3e)}function T3e(e){try{let t=w3e(e);return N.debug(\'Switching to locale "%s"\',e),Kh=t,_3e?.next(t),!0}catch(t){return N.error(`Failed to load locale ${e}: %o`,{error:t}),!1}}function E3e(e){return C3e(e)?T3e(e)?(Na.set("locale",e),!0):!1:(N.warn("Rejected locale change to unavailable locale %o",{locale:e}),!1)}function D3e(){if(!Kh){try{Kh=w3e("en-US")}catch(e){N.error("Failed to load fallback en-US locale; using empty messages: %o",{error:e}),Kh=B4e({locale:"en-US",messages:{}},g3e)}_3e=new Sa.BehaviorSubject(Kh);try{let e=Na.get("locale");T3e(e!==void 0&&C3e(e)?e:x3e())}catch(e){N.error("Failed to determine best locale; keeping en-US fallback: %o",{error:e})}}}';
  const result = patchLocaleRuntime(source);
  assert.match(result, /function T3e\(e\)\{e=`zh-CN`;try\{/);
  assert.match(result, /C3e\(e\)\?T3e\(`zh-CN`\)\?\(Na\.set\("locale","zh-CN"\),!0\)/);
  assert.match(result, /Na\.get\("locale"\);T3e\(`zh-CN`\)/);
});

test('finds the renamed runtime locale chunk in newer Claude bundles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-runtime-asset-'));
  await writeFile(join(root, 'index.chunk-newhash.js'), 'function B9e(e){return D.debug(`Switching to locale "%s"`,e)}function V9e(){D.error(`Failed to determine best locale; keeping en-US fallback: %o`,{})}');
  await writeFile(join(root, 'index.chunk-other.js'), 'function other(){}');
  assert.equal(await findRuntimeLocaleAsset(root), join(root, 'index.chunk-newhash.js'));
});

test('finds the locale runtime chunk without relying on minified function names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-runtime-asset-semantic-'));
  await writeFile(join(root, 'index.chunk-newhash.js'), 'function DXe(e){return D.debug(`Switching to locale "%s"`,e)}function kXe(){D.error(`Failed to determine best locale; keeping en-US fallback: %o`,{})}');
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
  const map = buildWebTranslationMap(
    { first: 'Home', second: 'Code', third: 'Same' },
    { first: '首页', second: '代码', third: 'Same' },
  );
  assert.equal(map.Home, '首页');
  assert.equal(map.Code, '代码');
  assert.equal(map.Same, undefined);
});

test('reports only static interface messages that have no usable local translation', () => {
  const messages = [
    'New setting',
    'Existing setting',
    'Existing setting',
    '',
    'Whitespace translation',
    'Claude Code',
  ];
  const untranslated = collectUntranslatedInterfaceMessages(messages, {
    'Existing setting': '现有设置',
    'Whitespace translation': '  ',
  }, INTERFACE_PASSTHROUGHS);
  assert.deepEqual(untranslated, ['New setting', 'Whitespace translation']);
});

test('extracts distinct default messages from packaged settings assets', () => {
  const messages = extractDefaultMessages(
    'a({defaultMessage:"New setting",id:"one"});a({defaultMessage: "New setting",id:"two"});a({defaultMessage:"A \\u201ctitle\\u201d",id:"three"})',
  );
  assert.deepEqual(messages, ['New setting', 'A “title”']);
});

test('fills newly added Claude settings labels from the local fallback catalog', () => {
  const map = buildWebTranslationMap(
    {
      first: 'Extension settings',
      second: 'Proxy server',
      third: 'Conversation history',
    },
    {},
  );
  assert.equal(map['Extension settings'], '扩展设置');
  assert.equal(map['Proxy server'], '代理服务器');
  assert.equal(map['Conversation history'], '对话历史');
});

test('fills output style labels from the local fallback catalog', () => {
  const map = buildWebTranslationMap(
    {
      label: 'Output style',
      create: 'New output style',
      hint: 'Set the output style for this session',
    },
    {},
  );
  assert.equal(map['Output style'], '输出风格');
  assert.equal(map['New output style'], '新建输出风格');
  assert.equal(map['Set the output style for this session'], '设置此会话的输出风格');
});

test('reuses translations when Claude rotates message keys in a newer catalog', () => {
  const map = buildWebTranslationMap(
    { currentKey: 'A newly reused settings description' },
    { oldKey: '一个重新使用的设置说明' },
    { oldKey: 'A newly reused settings description' },
  );
  assert.equal(map['A newly reused settings description'], '一个重新使用的设置说明');
});

test('prefers legacy translations over local fallbacks for reused English messages', () => {
  const map = buildWebTranslationMap(
    { reused: 'Technical details', localOnly: 'Output style' },
    { oldReused: '旧目录译文' },
    { oldReused: 'Technical details' },
  );
  assert.equal(map['Technical details'], '旧目录译文');
  assert.equal(map['Output style'], '输出风格');
});

test('includes fallback translations for settings schema descriptions outside i18n catalogs', () => {
  const map = buildWebTranslationMap({ label: 'Output style' }, {});
  assert.equal(map['Controls the output style for assistant responses'], '控制助手回复的输出风格');
});

test('translates the latest Claude Code settings labels and descriptions', () => {
  const map = buildWebTranslationMap({
    font: 'Interface font',
    fontDescription: 'Font for the Claude Code interface — menus, sidebar, and chat.',
    outputDescription: 'How Claude structures its responses in Code sessions. Applies to new sessions; the session menu can override it for a single session.',
    sandboxDescription: 'Runs commands from Claude Code in an isolated sandbox. Takes effect for new sessions.',
    browserDescription: 'Claude can start your dev servers, browse the web in a built-in browser, and verify changes with screenshots, snapshots, and DOM inspection.',
    worktreeDescription: 'Where to store Git worktrees for isolated coding sessions.',
    dynamicDescription: 'Let Claude run multiple agents in parallel for complex tasks. Workflows can use a lot of your usage limit quickly.',
    simulatorDescription: 'Let Claude verify your changes in the iOS Simulator on this Mac: running your app, driving it through flows, and capturing screenshots and recordings. You will be asked before Claude uses each device. When off, Claude doesn’t get its simulator tools, and you can still use the simulator in the app yourself.',
  }, {});
  assert.equal(map['Interface font'], '界面字体');
  assert.equal(map['Font for the Claude Code interface — menus, sidebar, and chat.'], 'Claude Code 界面的字体——菜单、侧边栏和聊天。');
  assert.equal(map['How Claude structures its responses in Code sessions. Applies to new sessions; the session menu can override it for a single session.'], 'Claude 在代码会话中组织回复的方式。适用于新会话；会话菜单可针对单个会话覆盖此设置。');
  assert.equal(map['Runs commands from Claude Code in an isolated sandbox. Takes effect for new sessions.'], '在隔离沙箱中运行 Claude Code 命令。对新会话生效。');
  assert.equal(map['Claude can start your dev servers, browse the web in a built-in browser, and verify changes with screenshots, snapshots, and DOM inspection.'], 'Claude 可以启动开发服务器、在内置浏览器中浏览网页，并通过截图、快照和 DOM 检查验证更改。');
  assert.equal(map['Where to store Git worktrees for isolated coding sessions.'], '用于存储隔离代码会话 Git 工作树的位置。');
  assert.equal(map['Let Claude run multiple agents in parallel for complex tasks. Workflows can use a lot of your usage limit quickly.'], '允许 Claude 为复杂任务并行运行多个代理。工作流可能会很快消耗大量用量额度。');
  assert.equal(map['Let Claude verify your changes in the iOS Simulator on this Mac: running your app, driving it through flows, and capturing screenshots and recordings. You will be asked before Claude uses each device. When off, Claude doesn’t get its simulator tools, and you can still use the simulator in the app yourself.'], '允许 Claude 在此 Mac 的 iOS 模拟器中验证更改：运行应用、执行操作流程并捕获截图和录屏。Claude 使用每台设备前都会征求你的同意。关闭后，Claude 将无法使用模拟器工具，但你仍可在应用中自行使用模拟器。');
});

test('translates newly introduced settings and menu copy from the local fallback catalog', () => {
  const map = buildWebTranslationMap({
    connectorDescription: 'Connectors available to Claude during each run.',
    sandboxDescription: 'Runs commands from Claude Code in an isolated sandbox. Applies to new sessions.',
    browserDescription: 'Browser tabs keep cookies and logins across restarts in one saved browser shared by every session and Cowork. Per session gives each Code session its own copy instead, so sessions never see each other’s logins.',
    prefixError: 'Couldn’t save the branch prefix. Try again.',
    closeChat: 'Close chat',
    copyProject: 'Copy project or thread link',
    archiveProject: 'Threads in this project will be archived and become read-only. You can unarchive the project at any time via the <link>projects page</link>.',
    discardWarning: 'Discarding permanently deletes {count, plural, one {# uncommitted change} other {# uncommitted changes}} in this session’s worktree. The session stays archived.',
  }, {});
  assert.equal(map['Connectors available to Claude during each run.'], '每次运行期间可供 Claude 使用的连接器。');
  assert.equal(map['Runs commands from Claude Code in an isolated sandbox. Applies to new sessions.'], '在隔离沙箱中运行 Claude Code 命令。适用于新会话。');
  assert.equal(map['Browser tabs keep cookies and logins across restarts in one saved browser shared by every session and Cowork. Per session gives each Code session its own copy instead, so sessions never see each other’s logins.'], '浏览器标签页会在重启后保留 Cookie 和登录状态，并由所有会话和 Cowork 共享同一个已保存的浏览器。选择“每个会话”后，每个代码会话使用自己的副本，会话之间不会看到彼此的登录状态。');
  assert.equal(map['Couldn’t save the branch prefix. Try again.'], '无法保存分支前缀，请重试。');
  assert.equal(map['Close chat'], '关闭聊天');
  assert.equal(map['Copy project or thread link'], '复制项目或线程链接');
  assert.equal(map['Threads in this project will be archived and become read-only. You can unarchive the project at any time via the <link>projects page</link>.'], '此项目中的线程将被归档并变为只读。你可随时通过<link>项目页面</link>取消归档。');
  assert.equal(map['Discarding permanently deletes {count, plural, one {# uncommitted change} other {# uncommitted changes}} in this session’s worktree. The session stays archived.'], '丢弃将永久删除此会话工作树中的 {count, plural, one {# 项未提交更改} other {# 项未提交更改}}。会话仍将保持归档状态。');
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

test('patches the modern native menu builder used by Claude 1.32885', () => {
  const source = 'async function tQ(){let e=await BNn();return o.Menu.buildFromTemplate(e)}';
  const result = patchNativeMenuLocale(source);
  assert.match(result, /Menu\.buildFromTemplate\(e\.map\(i\)\)/);
  assert.match(result, /About Claude/);
  assert.match(result, /撤销/);
  assert.match(result, /"Command Palette…":`命令面板…`/);
  assert.match(result, /"Open Folder…":`打开文件夹…`/);
  assert.match(result, /"Close chat":"关闭聊天"/);
  assert.match(result, /pasteAndMatchStyle:`粘贴并匹配样式`/);
  assert.match(result, /zoom:`缩放`/);
  assert.match(result, /关于 \$\{e\.label\.slice\(6\)\}/);
});

test('patches the Claude 1.34493 native menu builder after minified symbol rotation', () => {
  const source = 'var gDn=async()=>[await Nrn(),Vyn()];async function FZ(){let e=await gDn();return o.Menu.buildFromTemplate(e)}';
  const result = patchNativeMenuLocale(source);
  assert.match(result, /async function FZ\(\)\{let e=await gDn\(\);/);
  assert.match(result, /Menu\.buildFromTemplate\(e\.map\(i\)\)/);
  assert.match(result, /"Show Main Window":`显示主窗口`/);
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
  await writeFile(join(resourcesDir, 'ion-dist', 'i18n', 'en-US.json'), JSON.stringify({
    general: 'General',
    technicalDetails: 'Technical details',
    archiveProjects: 'Archive {count, plural, one {project} other {# projects}}?',
    archiveDetails: 'Threads in this project will be archived and become read-only. You can unarchive the project at any time via the <link>projects page</link>.',
  }));
  await writeFile(join(resourcesDir, 'ion-dist', 'assets', 'v1', 'shared-2.js'), registry);
  await writeFile(
    join(resourcesDir, 'ion-dist', 'assets', 'v1', 'c71860c77-Fj5_GsGa.js'),
    'const extensions={id:"extensions",title:a(Q,{defaultMessage:"Extensions",id:"nb2FlN/G2m"})};t({defaultMessage:"Advanced settings"});t({defaultMessage:"General"});t({defaultMessage: "Zebra setting"});t({defaultMessage:"Claude Code"});',
  );
  await writeFile(
    join(resourcesDir, 'ion-dist', 'assets', 'v1', 'c71860c77-CpuCnKDC.js'),
    'const settings=[{id:"appearance",title:1},{id:"general",title:2}];t({defaultMessage: "apple setting"});t({defaultMessage: "Äther setting"});',
  );
  await writeFile(
    join(resourcesDir, 'ion-dist', 'assets', 'v1', 'c42d32d95-DHTanC_8.js'),
    't({defaultMessage: "Non-target UI copy"});',
  );
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
    if (url.includes('/contents/translated-zh-CN/ion-dist/en-US.json')) {
      return response({ encoding: 'base64', content: Buffer.from('{"hello":"Hello"}').toString('base64') });
    }
    if (url.includes('/contents/translated-zh-CN/')) {
      return response({ encoding: 'base64', content: Buffer.from('{"hello":"你好","technicalDetails":"当前真实中文"}').toString('base64') });
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
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Resources', 'ion-dist', 'i18n', 'zh-CN.json'), 'utf8')), {
    hello: '你好',
    technicalDetails: '当前真实中文',
    general: '通用',
    archiveProjects: '归档 {count, plural, one {项目} other {# 个项目}}？',
    archiveDetails: '此项目中的线程将被归档并变为只读。你可随时通过<link>项目页面</link>取消归档。',
  });
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Resources', 'ion-dist', 'i18n', 'dynamic', 'zh-CN.json'), 'utf8')), {
    hello: '你好',
    technicalDetails: '当前真实中文',
  });
  assert.match(await readFile(join(result.appPath, 'Contents', 'Resources', 'ion-dist', 'assets', 'v1', 'shared-2.js'), 'utf8'), /"zh-CN"/);
  assert.equal(await readFile(join(resourcesDir, 'ion-dist', 'assets', 'v1', 'shared-2.js'), 'utf8'), sourceRegistry);
  assert.deepEqual(result.manifest.writes.map(({ source, destination }) => ({ source, destination })), [
    { source: 'ion', destination: 'Contents/Resources/zh-CN.json' },
    { source: 'ion', destination: 'Contents/Resources/ion-dist/i18n/zh-CN.json' },
    { source: 'dynamic', destination: 'Contents/Resources/ion-dist/i18n/dynamic/zh-CN.json' },
  ]);
  assert.deepEqual(JSON.parse(await readFile(join(result.appPath, 'Contents', 'Resources', 'zh-CN.json'), 'utf8')), {
    hello: '你好',
    technicalDetails: '当前真实中文',
  });
  assert.equal(result.manifest.localeRegistryAsset, 'Contents/Resources/ion-dist/assets/v1/shared-2.js');
  assert.deepEqual(result.manifest.skipped, [{ source: 'desktop', reason: 'destination-directory-missing' }]);
  assert.deepEqual(result.manifest.untranslatedInterfaceMessages, ['Advanced settings', 'Extensions', 'Zebra setting', 'apple setting', 'Äther setting']);
  assert.deepEqual(result.manifest.interfaceAuditAssets, ['c71860c77-CpuCnKDC.js', 'c71860c77-Fj5_GsGa.js']);
  assert.equal(entitlementSnapshots.length, 2);
  assert.ok(entitlementSnapshots.every((snapshot) => /com\.apple\.security\.cs\.allow-jit/.test(snapshot)));
  assert.equal(calls.some(({ file, args }) => file === '/usr/bin/codesign' && args.some((arg) => arg === appDir)), false);

  await rm(join(appDir, 'Contents', 'Resources', 'ion-dist', 'assets', 'v1', 'c71860c77-Fj5_GsGa.js'));
  await assert.rejects(
    buildLocalizedClone({
      appDir,
      version: '1.30096.5',
      outputDir: join(root, 'Incomplete Applications'),
      fetchImpl,
      execFile,
    }),
    /Required static settings anchor group was not found: extension settings/,
  );
});
