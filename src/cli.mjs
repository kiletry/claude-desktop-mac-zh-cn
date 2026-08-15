import { UserError } from './errors.mjs';

const HELP = `Usage: claude-desktop-mac-zh-cn <command>

Commands:
  status   Inspect the Claude Desktop installation
  install  Install Simplified Chinese language resources
  update   Update installed Simplified Chinese resources
  restore  Restore an installer-created backup`;

const COMMANDS = new Set(['status', 'install', 'update', 'restore']);

export async function runCli(argv, dependencies = {}) {
  const write = dependencies.write ?? console.log;
  const [command] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    write(HELP);
    return 0;
  }

  if (!COMMANDS.has(command)) {
    throw new UserError(`Unknown command: ${command}`);
  }

  throw new UserError(`Command not implemented yet: ${command}`);
}
