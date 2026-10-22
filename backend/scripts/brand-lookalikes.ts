/**
 * Lists the dictionary words that fixBrands() would still rewrite into a brand name.
 * Every word printed here must go into NEVER_CORRECT (scan.service.ts), unless it is a real
 * misspelling of the brand (e.g. "johnie" -> Johnnie).
 *
 * Word lists: the fr/en frequency dictionaries of pyspellchecker (MIT), e.g.
 *   pip download pyspellchecker --no-deps -d /tmp/ps && cd /tmp/ps && unzip -q pyspellchecker-*.whl
 *   gunzip -k spellchecker/resources/fr.json.gz spellchecker/resources/en.json.gz
 * Run (from backend/):
 *   npx tsx scripts/brand-lookalikes.ts /tmp/ps/spellchecker/resources/fr.json /tmp/ps/spellchecker/resources/en.json
 */
import fs from 'fs';
import { fixBrands, norm } from '../src/services/scan.service';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: tsx scripts/brand-lookalikes.ts <words.json> [more.json…]');
  process.exit(2);
}
const found = new Map<string, string>();
for (const file of files) {
  const words = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, number>);
  for (const w of words) {
    if (!/^[a-zà-ÿœæ'-]+$/i.test(w)) continue;
    const key = norm(w).replace(/[^a-z0-9]/g, '');
    const fixed = fixBrands(w).text;
    if (norm(fixed).replace(/[^a-z0-9]/g, '') !== key) found.set(key, `${w} -> ${fixed}`);
  }
}
for (const [key, how] of [...found].sort()) console.log(`'${key}',  // ${how}`);
console.log(`${found.size} word(s) rewritten`);
