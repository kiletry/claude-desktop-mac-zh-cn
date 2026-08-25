import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

async function text(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8');
}

test('release workflow verifies pinned Node runtimes and publishes exactly one DMG and CLI tarball', async () => {
  const workflow = await text('.github/workflows/release-generator.yml');

  assert.match(workflow, /NODE_VERSION:\s*['"]?\d+\.\d+\.\d+['"]?/);
  assert.match(workflow, /NODE_DARWIN_ARM64_SHA256:\s*['"]?[a-f0-9]{64}['"]?/i);
  assert.match(workflow, /NODE_DARWIN_X64_SHA256:\s*['"]?[a-f0-9]{64}['"]?/i);
  assert.match(workflow, /node-v\$\{\{ env\.NODE_VERSION \}\}-darwin-arm64\.tar\.gz/);
  assert.match(workflow, /node-v\$\{\{ env\.NODE_VERSION \}\}-darwin-x64\.tar\.gz/);
  assert.match(workflow, /shasum -a 256 -c/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /verify:generator-bundle/);
  assert.match(workflow, /lipo dist\/ClaudeChineseGenerator-universal -verify_arch arm64 x86_64/);
  assert.match(workflow, /--clean-check/);
  assert.match(workflow, /SHA256SUMS/);
  const cliPackageIndex = workflow.indexOf('npm pack --pack-destination dist/release');
  const appBuildIndex = workflow.indexOf('npm run build:generator');
  assert.ok(cliPackageIndex >= 0 && cliPackageIndex < appBuildIndex, 'CLI tgz is packed before generated app and DMG artifacts exist');
  assert.match(workflow, /find dist\/release -maxdepth 1 -name ['"]\*\.dmg['"] -type f \| wc -l/);
  assert.match(workflow, /find dist\/release -maxdepth 1 -name ['"]\*\.tgz['"] -type f \| wc -l/);
  assert.match(workflow, /gh release create[\s\S]*dist\/release\/\*\.dmg[\s\S]*dist\/release\/\*\.tgz/);
  assert.match(workflow, /临时签名|ad-hoc signing/i);
  assert.match(workflow, /3P|Cowork/i);
  assert.doesNotMatch(workflow, /shell:\s*zsh\s*$/m);
  assert.match(workflow, /shell:\s*\/bin\/zsh \{0\}/);
});

test('graphical installer documentation leads with DMG and covers local operational boundaries', async () => {
  const readme = await text('README.md');
  const guide = await text('docs/GRAPHICAL-INSTALLER.md');
  const notice = await text('NOTICE');

  assert.ok(readme.indexOf('图形化') < readme.indexOf('./install.sh status'));
  assert.match(readme, /CLI.*备用|命令行.*备用|命令行.*回退/);
  for (const requirement of [
    /临时签名/,
    /3P|第三方/,
    /Cowork/,
    /Gatekeeper/,
    /Cockpit Tools/,
    /CC Switch/,
    /日志/,
    /回滚/,
    /无效安装/,
  ]) {
    assert.match(guide, requirement);
  }
  assert.match(notice, /临时签名|ad-hoc signing/i);
  assert.match(notice, /3P|Cowork/i);
});
