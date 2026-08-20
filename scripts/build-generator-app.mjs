#!/usr/bin/env node
import { access, chmod, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as defaultExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(defaultExecFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const packageEntries = ['bin', 'src', 'package.json', 'package-lock.json', 'node_modules'];
const runtimeNames = ['node-arm64', 'node-x64'];

export async function buildGeneratorApp({
  runtimeDir,
  output,
  outputDir,
  executable,
  sourceCommit,
  rootDir = projectDir,
} = {}) {
  const appPath = resolve(output ?? outputDir ?? 'dist/Claude 中文生成器.app');
  if (!runtimeDir) throw new Error('Missing required --runtime-dir directory.');
  const resolvedRuntimeDir = resolve(runtimeDir);
  const runtimePaths = Object.fromEntries(await Promise.all(runtimeNames.map(async (name) => {
    const path = join(resolvedRuntimeDir, name);
    let metadata;
    try { metadata = await stat(path); } catch { throw new Error(`Required runtime ${name} is missing.`); }
    if (!metadata.isFile() || metadata.size === 0) throw new Error(`Required runtime ${name} must be a non-empty file.`);
    return [name, path];
  })));
  const sourceRoot = resolve(rootDir);
  await assertPackageInputs(sourceRoot);
  const swiftExecutable = executable ? resolve(executable) : join(sourceRoot, 'installer-macos', '.build', 'release', 'ClaudeChineseGenerator');
  await assertFile(swiftExecutable, 'Swift generator executable');
  const packageJson = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'));
  const commit = sourceCommit ?? await currentCommit(sourceRoot);
  const contents = join(appPath, 'Contents');
  const macOS = join(contents, 'MacOS');
  const resources = join(contents, 'Resources');
  const packageRoot = join(resources, 'runtime', 'package');
  const firstLaunchReadme = await existingPath(
    join(sourceRoot, 'installer-macos', 'Resources', 'README-first-launch.txt'),
    join(projectDir, 'installer-macos', 'Resources', 'README-first-launch.txt'),
  );

  await rm(appPath, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  await Promise.all(packageEntries.map((entry) => cp(join(sourceRoot, entry), join(packageRoot, entry), { recursive: true, force: true })));
  await mkdir(macOS, { recursive: true });
  await cp(swiftExecutable, join(macOS, 'ClaudeChineseGenerator'), { force: true });
  await Promise.all([
    ...runtimeNames.map((name) => cp(runtimePaths[name], join(resources, 'runtime', name), { force: true })),
    cp(firstLaunchReadme, join(resources, 'README-first-launch.txt'), { force: true }),
  ]);
  await Promise.all([
    chmod(join(macOS, 'ClaudeChineseGenerator'), 0o755),
    ...runtimeNames.map((name) => chmod(join(resources, 'runtime', name), 0o755)),
  ]);
  await writeFile(join(contents, 'Info.plist'), infoPlist());
  await writeFile(join(resources, 'runtime', 'manifest.json'), `${JSON.stringify({
    generatorVersion: packageJson.version,
    supportedArchitectures: ['arm64', 'x64'],
    sourceCommit: commit,
  }, null, 2)}\n`);
  return { appPath, manifestPath: join(resources, 'runtime', 'manifest.json') };
}

async function existingPath(...paths) {
  for (const path of paths) {
    try { await access(path); return path; } catch { /* try next candidate */ }
  }
  throw new Error('README-first-launch.txt is missing.');
}

async function assertPackageInputs(rootDir) {
  await Promise.all(packageEntries.map((entry) => assertFileOrDirectory(join(rootDir, entry), `Package input ${entry}`)));
}

async function assertFile(path, name) {
  let metadata;
  try { metadata = await stat(path); } catch { throw new Error(`${name} is missing: ${path}`); }
  if (!metadata.isFile()) throw new Error(`${name} must be a file: ${path}`);
}

async function assertFileOrDirectory(path, name) {
  try { await stat(path); } catch { throw new Error(`${name} is missing: ${path}`); }
}

async function currentCommit(cwd) {
  try { return (await execFile('git', ['rev-parse', 'HEAD'], { cwd })).stdout.trim(); } catch { return 'unknown'; }
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ClaudeChineseGenerator</string>
<key>CFBundleIdentifier</key><string>com.kiletry.claude-desktop-mac-zh-cn-generator</string>
<key>CFBundleName</key><string>Claude 中文生成器</string>
<key>CFBundleDisplayName</key><string>Claude 中文生成器</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>ClaudeChineseGeneratorUsageDescription</key><string>Writes a separately signed Chinese Claude copy only after you confirm the operation.</string>
<key>NSHumanReadableCopyright</key><string>Creates an independent localized Claude copy after confirmation.</string>
</dict></plist>
`;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--runtime-dir') options.runtimeDir = argv[++index];
    else if (option === '--output' || option === '--output-dir') options.output = argv[++index];
    else if (option === '--executable') options.executable = argv[++index];
    else throw new Error(`Unknown option: ${option}`);
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildGeneratorApp(parseArguments(process.argv.slice(2))).then(({ appPath }) => {
    process.stdout.write(`${appPath}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
