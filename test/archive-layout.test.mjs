import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPackage, createPackageWithOptions, extractFile, statFile, uncache } from '@electron/asar';
import { inspectClaudeApp } from '../src/claude-inspector.mjs';
import { buildLocalizedClone } from '../src/localized-clone.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'claude-archive-layout-'));
  const app = join(root, 'Claude.app'), resources = join(app, 'Contents', 'Resources');
  const frontend = join(root, 'frontend'), runtime = join(root, 'runtime');
  for (const path of [resources, join(app, 'Contents', 'MacOS'), join(frontend, 'i18n', 'dynamic'), join(frontend, 'assets', 'v1'), join(runtime, '.vite', 'build'), join(runtime, 'resources', 'i18n'), join(runtime, 'native')]) await mkdir(path, { recursive: true });
  await writeFile(join(app, 'Contents', 'Info.plist'), '{}');
  await writeFile(join(app, 'Contents', 'MacOS', 'Claude'), 'native executable');
  await writeFile(join(frontend, 'i18n', 'en-US.json'), '{"general":"General"}');
  await writeFile(join(frontend, 'i18n', 'dynamic', 'en-US.json'), '{}');
  await writeFile(join(frontend, 'assets', 'v1', 'shared.js'), 'const L=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];');
  await writeFile(join(frontend, 'assets', 'v1', 'settings.js'), 'const s=[{id:"general",title:2}];t({defaultMessage:"Extensions"});t({defaultMessage:"Advanced settings"});');
  await writeFile(join(frontend, 'assets', 'v1', 'appearance.js'), 'const s={id:"appearance",title:1};');
  await writeFile(join(runtime, '.vite', 'build', 'index.chunk-current.js'), 'function load(e){try{log(`Switching to locale "%s"`);return true}catch{return false}}function request(e){return load(e)?(config.set("locale",e),true):false}load(config.get("locale",fallback()));log("Failed to determine best locale; keeping en-US fallback");async function menu(){let e=await template(flag());return electron.Menu.buildFromTemplate(e)}');
  await writeFile(join(runtime, '.vite', 'build', 'mainView.js'), 'let t=require("electron"),n=require("electron/renderer");');
  await writeFile(join(runtime, '.vite', 'build', 'folder-dialog.js'), `dialog.showMessageBox({message:"This folder can't be added"});`);
  await writeFile(join(runtime, 'resources', 'i18n', 'en-US.json'), '{"menu":"File"}');
  await writeFile(join(runtime, 'native', 'addon.node'), 'native module fixture');
  await writeFile(join(runtime, 'native', 'helper, [special].node'), 'second native fixture');
  await createPackage(frontend, join(resources, 'ion-dist.asar'));
  await createPackageWithOptions(runtime, join(resources, 'app.asar'), { unpack: '**/*.node' });
  return { root, app, resources };
}

test('inspects archived frontend resources without extracting or modifying the official app', async () => {
  const { app, resources } = await fixture();
  const before = await readFile(join(resources, 'ion-dist.asar'));
  const result = await inspectClaudeApp(app, { execFile: async file => ({ stdout: file.endsWith('plutil') ? JSON.stringify({CFBundleIdentifier:'com.anthropic.claudefordesktop',CFBundleShortVersionString:'4.29.0'}) : '', stderr: '' }) });
  assert.equal(result.version, '4.29.0');
  assert.equal(result.layout.frontendArchive, join(resources, 'ion-dist.asar'));
  assert.deepEqual(await readFile(join(resources, 'ion-dist.asar')), before);
  await assert.rejects(access(join(resources, 'ion-dist')));
});

test('generates packed frontend and desktop catalogs while preserving native unpacked files and both integrity updates', async () => {
  const { root, app, resources } = await fixture();
  const before = await readFile(join(resources, 'app.asar'));
  const packageValue = { schemaVersion: 1, translations: [{ version: '4.29.0', files: { ion: '{"general":"通用"}', dynamic: '{}', desktop: '{"menu":"文件"}' }, english: '{"general":"General"}' }] };
  const commands=[];
  const result = await buildLocalizedClone({ appDir: app, version: '4.29.0', outputDir: join(root, 'out, with special [chars]'), fetchImpl: async () => ({ok:true,json:async()=>packageValue}), execFile: async(file,args)=>{
    commands.push({file,args});
    if(file.endsWith('ditto')) await cp(args[1],args[2],{recursive:true});
    return {stdout:'',stderr:''};
  }});
  const out=join(result.appPath,'Contents','Resources');
  uncache(join(out,'ion-dist.asar')); uncache(join(out,'app.asar'));
  assert.equal(JSON.parse(extractFile(join(out,'ion-dist.asar'),'i18n/zh-CN.json')).general,'通用');
  assert.equal(JSON.parse(extractFile(join(out,'app.asar'),'resources/i18n/zh-CN.json')).menu,'文件');
  assert.match(extractFile(join(out,'ion-dist.asar'),'assets/v1/shared.js').toString(), /zh-CN/);
  assert.match(extractFile(join(out,'app.asar'),'.vite/build/index.chunk-current.js').toString(), /zh-CN/);
  assert.match(extractFile(join(out,'app.asar'),'.vite/build/folder-dialog.js').toString(), /无法添加此文件夹/);
  assert.equal(statFile(join(out,'app.asar'),'native/addon.node').unpacked,true);
  assert.equal(await readFile(join(out,'app.asar.unpacked','native','addon.node'),'utf8'),'native module fixture');
  assert.equal(statFile(join(out,'app.asar'),'native/helper, [special].node').unpacked,true);
  assert.equal(await readFile(join(out,'app.asar.unpacked','native','helper, [special].node'),'utf8'),'second native fixture');
  assert.ok(commands.some(({args})=>args.some(v=>v.includes('Resources/ion-dist.asar:hash'))));
  assert.ok(commands.some(({args})=>args.some(v=>v.includes('Resources/app.asar:hash'))));
  assert.deepEqual(await readFile(join(resources,'app.asar')),before);
  await assert.rejects(access(join(out,'ion-dist')));
});
