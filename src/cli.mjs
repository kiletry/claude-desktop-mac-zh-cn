import { CompatibilityError, UserError, asExitCode } from './errors.mjs';
import { inspectClaudeApp } from './claude-inspector.mjs';
import { buildCompanion, launchCompanion } from './companion.mjs';
import { buildLocalizedClone } from './localized-clone.mjs';
import { DEFAULT_BACKUP_DIR, findLatestOfficialBackup, restoreOfficialBackup } from './backup-manager.mjs';
import { createGeneratorEvent, serializeGeneratorEvent } from './generator-events.mjs';
import { fileURLToPath } from 'node:url';
import { spawn as defaultSpawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HELP = `Usage: claude-desktop-mac-zh-cn <command>

Commands:
  status            Inspect the official Claude Desktop installation
  generate          Generate Claude 中文.app from the official Claude.app
                    Options: --app-mode clone|official, --translation-mode full|safe,
                    --backup-dir PATH, --backup-policy overwrite|versioned,
                    --backup-count N, --confirm-official-modification
  build-companion   Build the separate offline companion
  launch-companion  Launch the separate offline companion
  build-localized-clone  Build an independently signed Chinese Claude copy
  restore-official       Restore /Applications/Claude.app from a managed backup`;

const COMMANDS = new Set(['status', 'generate', 'build-companion', 'launch-companion', 'build-localized-clone', 'restore-official']);
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
  if (command === 'restore-official') {
    const backupPath = options.backup ?? await findLatestOfficialBackup({ backupDir: options.backupDir ?? DEFAULT_BACKUP_DIR });
    if (!backupPath) throw new UserError('No managed official backup was found. Pass --backup PATH or reinstall Claude from the official DMG.');
    const restore = dependencies.restoreOfficialBackup ?? restoreOfficialBackup;
    const result = await restore({ backupPath, targetPath: appDir });
    output(result);
    return 0;
  }
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
  if (isCloneCommand && options.appMode === 'official' && options.confirmOfficialModification !== true) {
    throw new UserError('Modifying the official Claude.app requires --confirm-official-modification.');
  }
  const operation = command === 'build-companion'
    ? () => (dependencies.buildCompanion ?? buildCompanion)({ appDir, version: app.version, projectDir, outputDir: companionOutputDir })
    : isCloneCommand
      ? () => (dependencies.buildLocalizedClone ?? buildLocalizedClone)({
        appDir,
        version: app.version,
        outputDir: cloneOutputDir,
        replace: options.replace === true,
        ...(options.appMode === undefined ? {} : { appMode: options.appMode }),
        ...(options.translationMode === undefined ? {} : { translationMode: options.translationMode }),
        ...(options.backupDir === undefined ? {} : { backupDir: options.backupDir }),
        ...(options.backupPolicy === undefined ? {} : { backupPolicy: options.backupPolicy }),
        ...(options.backupCount === undefined ? {} : { backupCount: options.backupCount }),
        ...(options.confirmOfficialModification === undefined ? {} : { confirmOfficialModification: options.confirmOfficialModification === true }),
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
    if (options.appMode !== 'official') assertTrustedClaude(finalApp);
    emit({ event: 'stage_succeeded', stage: 'verify', message: 'Generated app verification succeeded.' });
    if ((command === 'build-companion' || isCloneCommand) && result) {
      const resultOutput = {
        appPath: result.appPath,
        translationVersion: result.translationVersion,
        sourceCommit: result.sourceCommit,
      };
      if (result?.appMode) resultOutput.appMode = result.appMode;
      if (result?.translationMode) resultOutput.translationMode = result.translationMode;
      if (result?.backup) resultOutput.backup = result.backup;
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
    else if (arg === '--backup') options.backup = args[++index];
    else if (arg === '--backup-dir') options.backupDir = args[++index];
    else if (arg === '--output-dir') options.outputDir = args[++index];
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--app-mode') options.appMode = args[++index];
    else if (arg === '--translation-mode') options.translationMode = args[++index];
    else if (arg === '--backup-dir') options.backupDir = args[++index];
    else if (arg === '--backup-policy') options.backupPolicy = args[++index];
    else if (arg === '--backup-count') {
      const value = Number(args[++index]);
      if (!Number.isInteger(value)) throw new UserError('--backup-count must be a positive integer.');
      options.backupCount = value;
    }
    else if (arg === '--confirm-official-modification') options.confirmOfficialModification = true;
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
