/**
 * Visual regression — compare two capture directories (see capture.mjs).
 * Usage: node compare.mjs <referenceDir> <candidateDir>
 * Writes diff images to <candidateDir>/_diff and exits non-zero on any difference.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
const [a, b] = process.argv.slice(2);
const diffDir = path.join(b, '_diff');
mkdirSync(diffDir, { recursive: true });
let bad = 0;
for (const f of readdirSync(a).sort()) {
  if (f.startsWith('_') || f === 'console.log') continue;
  const fa = path.join(a, f),
    fb = path.join(b, f);
  let bufB;
  try {
    bufB = readFileSync(fb);
  } catch {
    console.log(`MISSING ${f}`);
    bad++;
    continue;
  }
  const bufA = readFileSync(fa);
  if (f.endsWith('.png')) {
    const pa = PNG.sync.read(bufA),
      pb = PNG.sync.read(bufB);
    if (pa.width !== pb.width || pa.height !== pb.height) {
      console.log(`SIZE   ${f} ${pa.width}x${pa.height} vs ${pb.width}x${pb.height}`);
      bad++;
      continue;
    }
    const diff = new PNG({ width: pa.width, height: pa.height });
    const n = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0.1 });
    if (n > 0) {
      writeFileSync(path.join(diffDir, f), PNG.sync.write(diff));
      bad++;
    }
    console.log(`${n === 0 ? 'OK    ' : 'DIFF  '} ${f} ${n} px`);
  } else {
    const h = (x) => createHash('sha1').update(x).digest('hex').slice(0, 10);
    const same = h(bufA) === h(bufB);
    if (!same) bad++;
    console.log(`${same ? 'OK    ' : 'DIFF  '} ${f} ${bufA.length}B vs ${bufB.length}B`);
  }
}
console.log(bad ? `${bad} difference(s)` : 'all identical');
process.exit(bad ? 1 : 0);
