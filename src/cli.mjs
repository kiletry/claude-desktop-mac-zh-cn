import { UserError } from './errors.mjs';
import { inspectClaudeApp } from './claude-inspector.mjs';
import { planLocaleRegistryPatch } from './locale-patch.mjs';
import { applyTransaction, restoreTransaction } from './transaction.mjs';
import { downloadTranslation, fetchUpstreamCatalog } from './upstream.mjs';
import { selectTranslationVersion } from './version.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

  const options = parseOptions(argv.slice(1));
  const appDir = options.appDir ?? '/Applications/Claude.app';
  const inspect = dependencies.inspectClaudeApp ?? inspectClaudeApp;
  const catalogFetch = dependencies.fetchUpstreamCatalog ?? fetchUpstreamCatalog;
  const select = dependencies.selectTranslationVersion ?? selectTranslationVersion;
  const output = dependencies.writeJson ?? ((value) => write(JSON.stringify(value, null, 2)));

  if (command === 'restore') {
    if (options.dryRun) return 0;
    if (!options.manifest) throw new UserError('restore requires --manifest PATH');
    const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
    await (dependencies.restoreTransaction ?? restoreTransaction)(manifest);
    write('Restored Claude Desktop language resources.');
    return 0;
  }

  const app = await inspect(appDir, dependencies.inspectOptions);
  const catalog = await catalogFetch({ fetchImpl: dependencies.fetchImpl });
  const selected = select(app.version, catalog.versions, { allowNearest: options.allowNearest });
  if (command === 'status') {
    output({ appDir, version: app.version, signing: app.signing, translation: selected, backups: 0 });
    return 0;
  }
  if (!options.dryRun && !options.acceptSignatureRisk) {
    throw new UserError('installing edits a signed app; pass --accept-signature-risk explicitly');
  }
  const translation = await (dependencies.downloadTranslation ?? downloadTranslation)({
    fetchImpl: dependencies.fetchImpl,
    commit: { ...catalog, sha: catalog.commit },
    version: selected.version,
  });
  const fileWrites = [];
  for (const [key, destination] of Object.entries({
    'ion-dist': join(app.layout.i18nDir, 'zh-CN.json'),
    'desktop-shell': app.layout.desktopShellDir ? join(app.layout.desktopShellDir, 'zh-CN.json') : null,
    dynamic: app.layout.dynamicDir ? join(app.layout.dynamicDir, 'zh-CN.json') : null,
  })) {
    if (translation.files[key] && destination) fileWrites.push({ destination, content: translation.files[key] });
  }
  if (app.layout.assetsDir) {
    for (const name of await readdir(app.layout.assetsDir)) {
      if (!name.endsWith('.js')) continue;
      const destination = join(app.layout.assetsDir, name);
      const original = await readFile(destination, 'utf8');
      if (!original.includes('"en-US"') || !original.includes('"id-ID"')) continue;
      const patched = planLocaleRegistryPatch(original);
      if (patched.changed) fileWrites.push({ destination, content: patched.text });
    }
  }
  const transaction = dependencies.applyTransaction ?? applyTransaction;
  const result = await transaction({
    backupRoot: join(homedir(), 'Library', 'Application Support', 'Claude Desktop zh-CN', 'backups'),
    dryRun: options.dryRun,
    plan: { fileWrites, metadata: { appVersion: app.version, sourceCommit: catalog.commit, sourceVersion: selected.version } },
  });
  output({ appDir, version: app.version, translation: selected, dryRun: options.dryRun, changedFiles: result.changedFiles });
  return 0;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--allow-nearest') options.allowNearest = true;
    else if (arg === '--accept-signature-risk') options.acceptSignatureRisk = true;
    else if (arg === '--app-dir') options.appDir = args[++index];
    else if (arg === '--manifest') options.manifest = args[++index];
    else throw new UserError(`Unknown option: ${arg}`);
  }
  return options;
}
