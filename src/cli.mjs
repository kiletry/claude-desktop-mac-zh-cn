import { CompatibilityError, UserError } from './errors.mjs';
import { inspectClaudeApp } from './claude-inspector.mjs';

const HELP = `Usage: claude-desktop-mac-zh-cn <command>

Commands:
  status            Inspect the official Claude Desktop installation
  build-companion   Build the separate offline companion
  launch-companion  Launch the separate offline companion`;

const COMMANDS = new Set(['status', 'build-companion', 'launch-companion']);
const RETIRED_COMMANDS = new Set(['install', 'update', 'restore']);

export async function runCli(argv, dependencies = {}) {
  const write = dependencies.write ?? console.log;
  const [command] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    write(HELP);
    return 0;
  }
  if (RETIRED_COMMANDS.has(command)) {
    throw new UserError(`${command} is retired: this tool never patches or writes inside Claude.app.`);
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
  const operation = command === 'build-companion'
    ? dependencies.buildCompanion
    : dependencies.launchCompanion;
  if (typeof operation !== 'function') {
    throw new UserError(`${command} is not available until the offline companion is installed.`);
  }
  await operation();
  assertTrustedClaude(await inspect(appDir, dependencies.inspectOptions));
  return 0;
}

function assertTrustedClaude(app) {
  if (!app.signing?.verified || !app.gatekeeper?.accepted) {
    throw new CompatibilityError('Claude.app must pass codesign and Gatekeeper assessment before companion operations.');
  }
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--app-dir') options.appDir = args[++index];
    else throw new UserError(`Unknown option: ${arg}`);
  }
  return options;
}
