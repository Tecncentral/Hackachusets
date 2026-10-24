// Regenerates the checked-in example files in packages/ai/examples/.
// Run: npx tsx packages/ai/scripts/write-examples.ts
// The examples test (examples.test.ts) fails if these files drift from real output.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExamples } from '../src/examples.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
mkdirSync(dir, { recursive: true });
for (const [name, value] of Object.entries(await buildExamples())) {
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(value, null, 2) + '\n');
  console.log(`wrote examples/${name}.json`);
}
