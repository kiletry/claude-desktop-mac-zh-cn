import assert from 'node:assert/strict';
import test from 'node:test';

import { runCli } from '../src/cli.mjs';

test('help exposes all public commands', async () => {
  const output = [];
  await runCli(['--help'], { write: (line) => output.push(line) });
  assert.match(output.join('\n'), /status.*install.*update.*restore/s);
});
