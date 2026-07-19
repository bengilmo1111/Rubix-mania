import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

async function restore(sourcePath, targetPath) {
  const encoded = (await readFile(sourcePath, 'utf8')).trim();
  const restored = gunzipSync(Buffer.from(encoded, 'base64'));
  await writeFile(targetPath, restored);
}

await restore('source/main.ts.gz.b64', 'src/main.ts');
await restore('source/style.css.gz.b64', 'src/style.css');
