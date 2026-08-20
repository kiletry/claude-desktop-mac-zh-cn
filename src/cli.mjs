import { CompatibilityError, UserError, asExitCode } from './errors.mjs';
import { inspectClaudeApp } from './claude-inspector.mjs';
import { buildCompanion, launchCompanion } from './companion.mjs';
import { buildLocalizedClone } from './localized-clone.mjs';
import { createGeneratorEvent, serializeGeneratorEvent } from './generator-events.mjs';
import { fileURLToPath } from 'node:url';
import { spawn as defaultSpawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HELP = `Usage: claude-desktop-mac-zh-cn <command>

Commands:
  status            Inspect the official Claude Desktop installation
  generate          Generate Claude 中文.app from the official Claude.app
  build-companion   Build the separate offline companion
  launch-companion  Launch the separate offline companion
  build-localized-clone  Build an independently signed Chinese Claude copy`;

const COMMANDS = new Set(['status', 'generate', 'build-companion', 'launch-companion', 'build-localized-clone']);
const RETIRED_COMMANDS = new Set(['install', 'update', 'restore']);

export async function runCli(argv, dependencies = {}) {
  const write = dependencies.write ?? console.log;
  const [command] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    write(HELP);
    return 0;
  }
  if (RETIRED_COMMANDS.has(command)) {
    throw new UserError(`${command} is retired: use the separate offline companion; this tool never patches, copies, or re-signs Claude.app.`);
  }
  if (!COMMANDS.has(command)) {
    throw new UserError(`Unknown command: ${command}`);
  }

  const options = parseOptions(argv.slice(1));
  const jsonEvents = options.jsonEvents === true;
  const emit = (event) => {
    if (jsonEvents) write(serializeGeneratorEvent(event));
  };
  const appDir = options.appDir ?? '/Applications/Claude.app';
  const inspect = dependencies.inspectClaudeApp ?? inspectClaudeApp;
  const output = dependencies.writeJson ?? ((value) => write(JSON.stringify(value, null, 2)));
  let app;
  emit({ event: 'inspection_started', stage: 'inspection', message: 'Inspecting the official Claude app.' });
  try {
    app = await inspect(appDir, dependencies.inspectOptions);
    emit({ event: 'inspection_succeeded', stage: 'inspection', message: 'Official app inspection succeeded.', value: jsonEvents ? {
      appDir,
      bundleId: app.bundleId,
      version: app.version,
      signing: app.signing,
      gatekeeper: app.gatekeeper,
    } : null });
  } catch (error) {
    emit({ event: 'error', stage: 'inspection', message: error instanceof Error ? error.message : String(error), value: asExitCode(error) });
    throw error;
  }

  if (command === 'status') {
    const result = { appDir, bundleId: app.bundleId, version: app.version, signing: app.signing, gatekeeper: app.gatekeeper };
    if (jsonEvents) {
      // The inspection_succeeded event is the status result in JSON-lines mode.
      return 0;
    }
    output(result);
    return 0;
  }

  try {
    assertTrustedClaude(app);
  } catch (error) {
    emit({ event: 'error', stage: 'inspection', message: error instanceof Error ? error.message : String(error), value: asExitCode(error) });
    throw error;
  }
  const projectDir = dependencies.projectDir ?? join(process.cwd(), 'companion-macos');
  const companionOutputDir = dependencies.outputDir ?? join(projectDir, '..', 'dist');
  const cloneOutputDir = options.outputDir ?? '/Applications';
  const isCloneCommand = command === 'generate' || command === 'build-localized-clone';
  const operation = command === 'build-companion'
    ? () => (dependencies.buildCompanion ?? buildCompanion)({ appDir, version: app.version, projectDir, outputDir: companionOutputDir })
    : isCloneCommand
      ? () => (dependencies.buildLocalizedClone ?? buildLocalizedClone)({
        appDir,
        version: app.version,
        outputDir: cloneOutputDir,
        replace: options.replace === true,
      })
      : (dependencies.launchCompanion ?? (() => launchCompanion({ appPath: join(companionOutputDir, 'Claude Chinese Companion.app') })));
  if (typeof operation !== 'function') {
    throw new UserError(`${command} is not available until the offline companion is installed.`);
  }
  let result;
  try {
    emit({ event: 'stage_started', stage: 'generation', message: 'Generation started.' });
    result = await operation();
    emit({ event: 'stage_succeeded', stage: 'generation', message: 'Generation operation completed.' });
  } catch (error) {
    await inspect(appDir, dependencies.inspectOptions).catch(() => null);
    emit({ event: 'error', stage: 'generation', message: error instanceof Error ? error.message : String(error), value: asExitCode(error) });
    throw error;
  }
  try {
    emit({ event: 'stage_started', stage: 'verify', message: 'Verifying the generated app.' });
    const finalApp = await inspect(appDir, dependencies.inspectOptions);
    assertTrustedClaude(finalApp);
    emit({ event: 'stage_succeeded', stage: 'verify', message: 'Generated app verification succeeded.' });
    if ((command === 'build-companion' || isCloneCommand) && result) {
      const resultOutput = {
        appPath: result.appPath,
        translationVersion: result.translationVersion,
        sourceCommit: result.sourceCommit,
      };
      if (jsonEvents) emit({ event: 'completed', stage: 'completed', message: 'Generation completed.', value: resultOutput });
      else output(resultOutput);
    } else if (jsonEvents) {
      emit({ event: 'completed', stage: 'completed', message: 'Operation completed.' });
    }
  } catch (error) {
    emit({ event: 'error', stage: 'verify', message: error instanceof Error ? error.message : String(error), value: asExitCode(error) });
    throw error;
  }
  return 0;
}

function assertTrustedClaude(app) {
  if (!app.signing?.verified || !app.gatekeeper?.accepted) {
    throw new CompatibilityError('Claude.app must pass codesign and Gatekeeper assessment before generation.');
  }
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--app-dir') options.appDir = args[++index];
    else if (arg === '--output-dir') options.outputDir = args[++index];
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--json-events') options.jsonEvents = true;
    else throw new UserError(`Unknown option: ${arg}`);
  }
  return options;
}

export function runGeneratorCommand(argv, {
  cwd = process.cwd(),
  env = process.env,
  spawn = defaultSpawn,
} = {}) {
  const bin = fileURLToPath(new URL('../bin/claude-desktop-mac-zh-cn.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...argv], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.stderr?.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}
