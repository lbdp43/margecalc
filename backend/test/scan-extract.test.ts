/**
 * Unit tests of the OCR text extractors (no image, no OCR engine: runs in ~1 s).
 * Run from backend/:  npm test   (= tsx test/scan-extract.test.ts)
 */
import assert from 'assert';
import {
  extractVolumeCl, extractAbv, fixBrands, extractBrand, extractPrice, detectCategory, extractInvoiceDate,
  parseInvoiceRow, pickProductName, smartCase, fixDigits, imageSize,
} from '../src/services/scan.service';

const line = (text: string, y0: number, height = 40, conf = 92) => ({ text, conf, height, x0: 0, y0, x1: 600, y1: y0 + height });

const tests: [string, () => void][] = [
  // --- volume / ABV / price ---
  ['volume cl', () => assert.strictEqual(extractVolumeCl('70 cl 40% vol'), 70)],
  ['volume OCR c1', () => assert.strictEqual(extractVolumeCl('JAMESON 70c1'), 70)],
  ['volume O->0', () => assert.strictEqual(extractVolumeCl('7O cl'), 70)],
  ['volume L decimal', () => assert.strictEqual(extractVolumeCl('Magnum 1,5 L'), 150)],
  ['volume 0.7L', () => assert.strictEqual(extractVolumeCl('0.7L'), 70)],
  ['volume ml', () => assert.strictEqual(extractVolumeCl('700 ml'), 70)],
  ['volume fut', () => assert.strictEqual(extractVolumeCl('Leffe fût 30L'), 3000)],
  ['volume 1L', () => assert.strictEqual(extractVolumeCl('Absolut 1L 40%'), 100)],
  ['volume none', () => assert.strictEqual(extractVolumeCl('Lot L12345 Dublin'), null)],
  ['volume 33CL', () => assert.strictEqual(extractVolumeCl('33CL'), 33)],
  ['abv', () => assert.strictEqual(extractAbv('70 cl 40% vol'), 40)],
  ['abv comma', () => assert.strictEqual(extractAbv('75 cl 13,5% vol'), 13.5)],
  ['abv degree', () => assert.strictEqual(extractAbv('12,5°'), 12.5)],
  ['abv alc', () => assert.strictEqual(extractAbv('alc. 5.5 % vol.'), 5.5)],
  ['abv ignores TVA', () => assert.strictEqual(extractAbv('TVA 20% 102,14 €'), null)],
  ['abv ignores 100%', () => assert.strictEqual(extractAbv('100% pur jus'), null)],
  ['price', () => assert.strictEqual(extractPrice('Prix 12,90 €'), 12.9)],
  ['price none', () => assert.strictEqual(extractPrice('70 cl'), null)],

  // --- category ---
  ['cat spirit', () => assert.strictEqual(detectCategory('JAMESON IRISH WHISKEY').slug, 'spiritueux')],
  ['cat wine', () => assert.strictEqual(detectCategory('Château Les Ollieux Corbières rouge').slug, 'vins')],
  ['cat beer', () => assert.strictEqual(detectCategory('Brasserie des Plantes Bière blonde').slug, 'bieres')],
  ['cat ginger beer is soft', () => assert.strictEqual(detectCategory('Fever-Tree Ginger Beer 20cl').slug, 'softs')],
  ['cat single malt not beer', () => assert.strictEqual(detectCategory('Aberlour 12 ans Single Malt Scotch Whisky').slug, 'spiritueux')],
  ['cat sirop', () => assert.strictEqual(detectCategory('Sirop Monin Grenadine 70cl').slug, 'ingredients_cocktails')],
  ['cat "origine" is not gin', () => assert.strictEqual(detectCategory('Origine France').certainty, 0)],
  ['cat abv fallback', () => assert.strictEqual(detectCategory('XYZ', 5, 33).slug, 'bieres')],
  ['cat consommables', () => assert.strictEqual(detectCategory('Gobelets carton 25cl x50').slug, 'consommables')],
  ['cat apple juice is soft', () => assert.strictEqual(detectCategory('JUS DE POMME BIO 25 cl').slug, 'softs')],
  ['cat 45 % "Marc de Bourgogne" is a spirit', () => assert.strictEqual(detectCategory('MARC DE BOURGOGNE\nMARC DE BOURGOGNE\n70 cl 45% vol', 45, 70).slug, 'spiritueux')],
  ['cat 20 % crème de cassis stays a cocktail ingredient', () => assert.strictEqual(detectCategory('CREME DE CASSIS DE DIJON 70 cl 20% vol', 20, 70).slug, 'ingredients_cocktails')],
  ['cat 13 % Bourgogne is a wine', () => assert.strictEqual(detectCategory('Bourgogne Pinot Noir 75 cl 13% vol', 13, 75).slug, 'vins')],

  // --- brand typo fixing: real OCR damage is still fixed ---
  ['brand fix: dropped edge letters', () => assert.strictEqual(fixBrands('AMESO Irish Whiskey').text, 'Jameson Irish Whiskey')],
  ['brand fix: digit for letter', () => assert.strictEqual(fixBrands('JAMES0N').text, 'Jameson')],
  ['brand fix: missing letter', () => assert.strictEqual(fixBrands('Hennesy VS').text, 'Hennessy VS')],
  ['brand fix: transposition', () => assert.strictEqual(fixBrands('Tanqeuray Gin').text, 'Tanqueray Gin')],
  ['brand fix: exact brand keeps case + hit', () => assert.deepStrictEqual(fixBrands('JAMESON'), { text: 'JAMESON', hit: true })],
  ['brand fix keeps words', () => assert.strictEqual(fixBrands('Herbe des Druides').hit, false)],
  ['brand of a fixed name', () => assert.strictEqual(extractBrand('Jameson Irish Whiskey'), 'Jameson')],

  // --- brand typo fixing: ordinary words read correctly are NEVER rewritten (regression) ---
  ...([
    'Rosé', 'Rose', 'ROSÉ', 'Roses', 'Pomme', 'POMME', 'Pommes', 'Dark', 'Marc', 'MARC', 'Sainte', 'Page', 'Sure',
    'Riviere', 'Rivière', 'Duval', 'Jupiter', 'Granit', 'Bullet', 'Poker', 'Martine', 'Remi', 'Serra', 'Pichon',
    // dictionary words one or two letters away from a brand
    'grands', 'billet', 'élément', 'terrier', 'tropical', 'Tropicale', 'boulanger', 'Richard', 'chauffe', 'Habana',
    'manier', 'millet', 'Plantain', 'patrons', 'Citadelles',
  ].map((w): [string, () => void] => [`keeps « ${w} »`, () => {
    const r = fixBrands(w);
    assert.strictEqual(r.text, w);
  }])),
  ['keeps « JUS DE POMME BIO »', () => assert.strictEqual(fixBrands('JUS DE POMME BIO').text, 'JUS DE POMME BIO')],
  ['keeps « Jus de Pomme » (no brand)', () => assert.strictEqual(extractBrand(fixBrands('Jus de Pomme').text), null)],
  ['keeps « MARC DE BOURGOGNE »', () => assert.strictEqual(fixBrands('MARC DE BOURGOGNE').text, 'MARC DE BOURGOGNE')],
  ['keeps « Côtes du Rhône Rosé »', () => assert.strictEqual(fixBrands('Côtes du Rhône Rosé').text, 'Côtes du Rhône Rosé')],
  ['keeps « Château Sainte Marie Rosé »', () => assert.strictEqual(fixBrands('Château Sainte Marie Rosé').text, 'Château Sainte Marie Rosé')],
  ['bottle name « JUS DE POMME | BIO | 25 cl »', () => {
    const r = pickProductName([line('JUS DE POMME', 100, 60), line('BIO', 170, 40), line('25 cl', 400, 30)], 'softs');
    assert.strictEqual(r.name, 'Jus de Pomme');
    assert.strictEqual(r.brand, false);
  }],
  ['bottle name « MARC DE | BOURGOGNE »', () => {
    const r = pickProductName([line('MARC DE', 100, 60), line('BOURGOGNE', 170, 60), line('70 cl 40% vol', 400, 30)], 'spiritueux');
    assert.strictEqual(r.name, 'Marc de Bourgogne');
  }],
  ['bottle name « CÔTES DU RHÔNE | Rosé »', () => {
    const r = pickProductName([line('CÔTES DU RHÔNE', 100, 60), line('Rosé', 170, 55)], 'vins');
    assert.strictEqual(r.name, 'Côtes du Rhône Rosé');
  }],

  // --- invoice ---
  ['date labelled', () => assert.strictEqual(extractInvoiceDate('Echéance : 13/11/2026\nDate : 14/10/2026'), '2026-10-14')],
  ['date text', () => assert.strictEqual(extractInvoiceDate('Lyon, le 3 octobre 2026'), '2026-10-03')],
  ['date 2-digit year', () => assert.strictEqual(extractInvoiceDate('Date facture 05.09.26'), '2026-09-05')],
  ['row basic', () => { const r = parseInvoiceRow('Jameson Irish Whiskey 70cl 40%     6     17,90     107,40')!; assert.deepStrictEqual([r.qty, r.unit, r.total, r.consistent], [6, 17.9, 107.4, true]); }],
  ['row garbled qty', () => { const r = parseInvoiceRow('Côtes du Rhône Rouge 75cl 2022    a2    4,85    58,20')!; assert.deepStrictEqual([r.qty, r.unit], [12, 4.85]); }],
  ['row no column gaps', () => { const r = parseInvoiceRow('Absolut Vodka Blue 1L 40% 3 16,50 49,50')!; assert.deepStrictEqual([r.name.trim(), r.qty, r.unit], ['Absolut Vodka Blue 1L 40%', 3, 16.5]); }],
  ['row PU after qty with € and ref', () => { const r = parseInvoiceRow('102345 Get 27 Liqueur 70cl   2   12,30 €   24,60 €')!; assert.deepStrictEqual([r.name.trim(), r.qty, r.unit], ['Get 27 Liqueur 70 cl', 2, 12.3]); }],
  ['row pack', () => { const r = parseInvoiceRow('Schweppes Tonic 20cl x24     4     11,20     44,80')!; assert.strictEqual(r.pack, 24); }],
  ['row thousands', () => { const r = parseInvoiceRow('Champagne Ruinart 75cl   12   45,00   540,00')!; assert.deepStrictEqual([r.qty, r.unit], [12, 45]); }],
  ['row total line has no designation', () => assert.strictEqual(parseInvoiceRow('     510,70 €'), null)],
  ['smartCase', () => assert.strictEqual(smartCase('HERBE DES DRUIDES'), 'Herbe des Druides')],
  ['fixDigits', () => assert.strictEqual(fixDigits('7O c1 / 75c¢l'), '70 cl / 75 cl')],

  // --- image header size (oversized photos are refused before OCR) ---
  ['png size', () => {
    const b = Buffer.alloc(33);
    b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii');
    b.writeUInt32BE(4032, 16); b.writeUInt32BE(3024, 20);
    assert.deepStrictEqual(imageSize(b), { width: 4032, height: 3024 });
  }],
  ['jpeg size (after APP0)', () => {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x0f, 0xc0, 0x0b, 0xd0, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    const b = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
    assert.deepStrictEqual(imageSize(b), { width: 3024, height: 4032 });
  }],
  ['unknown header', () => assert.strictEqual(imageSize(Buffer.from('not an image at all, really not')), null)],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e: any) {
    failed++;
    console.log(`FAIL ${name}: ${String(e.message).split('\n').slice(0, 3).join(' | ')}`);
  }
}
console.log(`scan extractors: ${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
