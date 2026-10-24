#!/usr/bin/env node
// Kiro postToolUse hook: run SceneBrief scenario tests when incident logic or extraction code changes.
// Reads the hook event JSON from stdin. Exit 0 = pass or not applicable; exit 1 = tests failed (stderr shown as warning).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const WATCHED = ['apps/api/src/', 'packages/ai/src/', 'packages/contracts/src/', 'packages/fixtures/src/'];

let event = {};
try { event = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const input = event.tool_input ?? {};
const candidates = [input.path, input.file_path].filter(p => typeof p === 'string');
const changed = candidates.map(p => relative(root, resolve(event.cwd ?? root, p))).filter(p => WATCHED.some(w => p.startsWith(w)));
if (changed.length === 0) process.exit(0);

const result = spawnSync('npx', ['vitest', 'run', 'apps/api/src'], { cwd: root, encoding: 'utf8' });
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
if (result.status === 0) {
  console.log(`SceneBrief scenario tests passed after change to ${changed.join(', ')}`);
  process.exit(0);
}
console.error(`SceneBrief scenario tests FAILED after change to ${changed.join(', ')}\n${output.slice(-4000)}`);
process.exit(1);
