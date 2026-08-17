#!/usr/bin/env node
import { buildCompanion } from '../src/companion.mjs';
await buildCompanion({ projectDir: new URL('../companion-macos', import.meta.url).pathname, outputDir: new URL('../dist', import.meta.url).pathname });
