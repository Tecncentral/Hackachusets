import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExamples } from './examples.js';

// The checked-in examples are what teammates read. They must match real output.
// If this fails after an intended change: npx tsx packages/ai/scripts/write-examples.ts
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');

describe('checked-in request/response examples', () => {
  it('match what the code actually produces', async () => {
    for (const [name, value] of Object.entries(await buildExamples())) {
      const onDisk = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
      expect(onDisk, name).toEqual(JSON.parse(JSON.stringify(value)));
    }
  });
});
