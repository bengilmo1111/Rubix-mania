import { readFile, writeFile } from 'node:fs/promises';

async function concatenate(prefix, count, output) {
  const parts = [];
  for (let index = 1; index <= count; index++) {
    parts.push(await readFile(`source/plain/${prefix}.part${index}`, 'utf8'));
  }
  await writeFile(output, parts.join(''));
}

await concatenate('main', 7, 'src/main.ts');
await concatenate('style', 2, 'src/style.css');
