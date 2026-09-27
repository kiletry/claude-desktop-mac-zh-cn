#!/usr/bin/env node
import { chmod, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as defaultExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(defaultExecFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
  const packageEntries = ['bin', 'src', 'package.json'];
const runtimeNames = ['node-arm64', 'node-x64'];

export async function buildGeneratorApp({
  runtimeDir,
  output,
  outputDir,
  executable,
  translationPackage,
  sourceCommit,
  rootDir = projectDir,
} = {}) {
  const appPath = resolve(output ?? outputDir ?? 'dist/Claude 中文生成器.app');
  validateOutputPath(appPath, resolve(rootDir));
  if (!runtimeDir) throw new Error('Missing required --runtime-dir directory.');
  const resolvedRuntimeDir = resolve(runtimeDir);
  assertRuntimeOutsideOutput(resolvedRuntimeDir, appPath);
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
  const firstLaunchReadme = join(sourceRoot, 'installer-macos', 'Resources', 'README-first-launch.txt');
  await assertFile(firstLaunchReadme, 'README-first-launch.txt');
  if (translationPackage) await assertFile(resolve(translationPackage), 'Translation package');

  await rm(appPath, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });
  await Promise.all(packageEntries.map((entry) => cp(join(sourceRoot, entry), join(packageRoot, entry), {
    recursive: true,
    force: true,
    dereference: true,
  })));
  await copyProductionDependencies({ sourceRoot, packageRoot });
  await mkdir(macOS, { recursive: true });
  await cp(swiftExecutable, join(macOS, 'ClaudeChineseGenerator'), { force: true });
  await Promise.all([
    ...runtimeNames.map((name) => cp(runtimePaths[name], join(resources, 'runtime', name), { force: true })),
    cp(firstLaunchReadme, join(resources, 'README-first-launch.txt'), { force: true }),
    cp(join(sourceRoot, 'installer-macos', 'Resources', 'ClaudeChineseGenerator.icns'), join(resources, 'ClaudeChineseGenerator.icns'), { force: true }),
    ...(translationPackage ? [cp(resolve(translationPackage), join(resources, 'runtime', 'translation-package.json'), { force: true })] : []),
  ]);
  await Promise.all([
    chmod(join(macOS, 'ClaudeChineseGenerator'), 0o755),
    ...runtimeNames.map((name) => chmod(join(resources, 'runtime', name), 0o755)),
  ]);
  await writeFile(join(contents, 'Info.plist'), infoPlist(packageJson.version));
  await writeFile(join(resources, 'runtime', 'manifest.json'), `${JSON.stringify({
    generatorVersion: packageJson.version,
    supportedArchitectures: ['arm64', 'x64'],
    sourceCommit: commit,
  }, null, 2)}\n`);
  return { appPath, manifestPath: join(resources, 'runtime', 'manifest.json') };
}

export async function copyProductionDependencies({ sourceRoot, packageRoot }) {
  const sourceNodeModules = join(sourceRoot, 'node_modules');
  const targetNodeModules = join(packageRoot, 'node_modules');
  const packageJson = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'));
  await mkdir(targetNodeModules, { recursive: true });
  // Preserve direct package links and .bin entries from npm/pnpm fixtures; dereference
  // them so the generated app remains usable without the source checkout.
  const directEntries = await readdir(sourceNodeModules, { withFileTypes: true }).catch(() => []);
  for (const entry of directEntries.filter(({ name }) => name !== '.pnpm')) {
    const source = join(sourceNodeModules, entry.name);
    const target = join(targetNodeModules, entry.name);
    await cp(source, target, { recursive: true, force: true, dereference: true });
  }
  const copied = new Set();
  const copyDependency = async (dependencyName) => {
    if (copied.has(dependencyName)) return;
    copied.add(dependencyName);
    const resolved = await resolveDependencyDirectory(dependencyName, sourceNodeModules);
    const dependencyTarget = join(targetNodeModules, dependencyName);
    await cp(resolved, dependencyTarget, { recursive: true, force: true, dereference: true });
    const dependencyPackage = JSON.parse(await readFile(join(resolved, 'package.json'), 'utf8'));
    for (const nestedName of Object.keys(dependencyPackage.dependencies ?? {})) await copyDependency(nestedName);
  };
  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) await copyDependency(dependencyName);
}

async function resolveDependencyDirectory(name, sourceNodeModules) {
  const direct = join(sourceNodeModules, name);
  if (await pathExists(direct)) return direct;
  const hoisted = join(sourceNodeModules, '.pnpm', 'node_modules', name);
  if (await pathExists(hoisted)) return hoisted;
  const candidates = await readdir(join(sourceNodeModules, '.pnpm')).catch(() => []);
  const candidate = candidates.find((entry) => entry.startsWith(`${name.replace('/', '+')}@`));
  if (!candidate) throw new Error(`Unable to locate production dependency ${name}.`);
  const resolved = join(sourceNodeModules, '.pnpm', candidate, 'node_modules', name);
  if (!await pathExists(resolved)) throw new Error(`Unable to locate production dependency ${name}.`);
  return resolved;
}

async function pathExists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function assertRuntimeOutsideOutput(runtimeDir, appPath) {
  const pathFromOutput = relative(appPath, runtimeDir);
  if (pathFromOutput === '' || (!pathFromOutput.startsWith('..') && !isAbsolute(pathFromOutput))) {
    throw new Error(`Runtime directory must be outside the generated app output: ${runtimeDir}`);
  }
}

function validateOutputPath(appPath, sourceRoot) {
  const forbidden = new Set([
    '/', '/Applications', '/Applications/Claude.app', '/Applications/Claude 中文.app',
    sourceRoot,
  ]);
  if (forbidden.has(appPath) || appPath === resolve(projectDir)) {
    throw new Error(`Refusing to remove unsafe generated-app destination: ${appPath}`);
  }
  if (appPath.endsWith('/Claude.app') || appPath.endsWith('/Claude 中文.app')) {
    throw new Error(`Refusing to remove unsafe generated-app destination: ${appPath}`);
  }
  if (!appPath.endsWith('/Claude 中文生成器.app')) {
    throw new Error(`Output must be a safe generated-app destination ending in Claude 中文生成器.app: ${appPath}`);
  }
}

async function assertPackageInputs(rootDir) {
  await Promise.all([...packageEntries, 'node_modules'].map((entry) => assertFileOrDirectory(join(rootDir, entry), `Package input ${entry}`)));
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

function infoPlist(version) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ClaudeChineseGenerator</string>
<key>CFBundleIdentifier</key><string>com.kiletry.claude-desktop-mac-zh-cn-generator</string>
<key>CFBundleName</key><string>Claude 中文生成器</string>
<key>CFBundleDisplayName</key><string>Claude 中文生成器</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleIconFile</key><string>ClaudeChineseGenerator.icns</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
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
    else if (option === '--translation-package') options.translationPackage = argv[++index];
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
