import { CompatibilityError, UserError } from './errors.mjs';
import { inspectClaudeApp } from './claude-inspector.mjs';
import { buildCompanion, launchCompanion } from './companion.mjs';
import { buildLocalizedClone } from './localized-clone.mjs';
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
  const appDir = options.appDir ?? '/Applications/Claude.app';
  const inspect = dependencies.inspectClaudeApp ?? inspectClaudeApp;
  const output = dependencies.writeJson ?? ((value) => write(JSON.stringify(value, null, 2)));
  const app = await inspect(appDir, dependencies.inspectOptions);

  if (command === 'status') {
    output({ appDir, bundleId: app.bundleId, version: app.version, signing: app.signing, gatekeeper: app.gatekeeper });
    return 0;
  }

  assertTrustedClaude(app);
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
  try {
    const result = await operation();
    if ((command === 'build-companion' || isCloneCommand) && result) {
      output({
        appPath: result.appPath,
        translationVersion: result.translationVersion,
        sourceCommit: result.sourceCommit,
      });
    }
  } finally {
    assertTrustedClaude(await inspect(appDir, dependencies.inspectOptions));
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
    else throw new UserError(`Unknown option: ${arg}`);
  }
  return options;
}
