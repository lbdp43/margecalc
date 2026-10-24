/**
 * Unit tests of the invoice line matcher (normalisation, scores, exact → alias → fuzzy order).
 * No database: runs in well under a second. Run from backend/:  npm test
 */
import assert from 'assert';
import {
  aliasNameKey, analyseLine, CANDIDATE_MIN_SCORE, CatalogIndex, editDistance, findCandidates, findMatch, FUZZY_THRESHOLD,
  lightKey, nameSimilarity, nameTokens, normaliseSupplier, tokenSimilarity, UNMATCHED_WORD_CAP,
} from '../src/services/invoiceMatch.service';

const P = (id: string, name: string, containerVolumeCl: number, createdAt = '2026-01-01T00:00:00Z') => ({ id, name, containerVolumeCl, createdAt });
const CATALOG = [
  P('cdr', 'Côtes du Rhône rouge', 75),
  P('cdr-rose', 'Côtes du Rhône rosé', 75),
  P('hendricks', "Hendrick's Gin", 70),
  P('jameson', 'Jameson Irish Whiskey', 70),
  P('jameson-1l', 'Jameson Irish Whiskey', 100),
  P('chivas12', 'Chivas Regal 12 ans', 70),
  P('leffe-blonde-fut', 'Leffe Blonde', 3000),
  P('leffe-ruby', 'Leffe Ruby', 3000),
  P('chartreuse', 'Chartreuse Verte', 70),
  P('coca', 'Coca-Cola 33 cl', 33),
];
const match = (name: string, cl: number, alias: ReturnType<typeof P> | null = null) => findMatch({ name, containerVolumeCl: cl }, CATALOG, alias);

const tests: [string, () => void][] = [
  // --- normalisation ---
  ['tokens: accents, case, vintage dropped', () => assert.deepStrictEqual(nameTokens('Côtes du Rhône Rouge 2022'), ['cotes', 'rhone', 'rouge'])],
  ['tokens: same as the catalogue name', () => assert.deepStrictEqual(nameTokens('Côtes du Rhône Rouge 2022'), nameTokens('Côtes du Rhône rouge'))],
  ['tokens: volume and degree dropped', () => assert.deepStrictEqual(nameTokens('Jameson Irish Whiskey 70cl 40% vol.'), ['jameson', 'irish', 'whiskey'])],
  ['tokens: decimal volume in litres', () => assert.deepStrictEqual(nameTokens('Absolut Vodka Blue 1,5 L'), ['absolut', 'vodka', 'blue'])],
  ['tokens: 75 CL and 0.75l', () => assert.deepStrictEqual([nameTokens('Chablis 75 CL'), nameTokens('Chablis 0.75l')], [['chablis'], ['chablis']])],
  ['tokens: glued volume « Rouge75cl »', () => assert.deepStrictEqual(nameTokens('Rouge75cl'), ['rouge'])],
  ['tokens: packs « x24 », « 6x33cl », « carton de 6 »', () => {
    assert.deepStrictEqual(nameTokens('Schweppes Tonic 20cl x24'), ['schweppes', 'tonic']);
    assert.deepStrictEqual(nameTokens('6x33cl Chimay Bleue'), ['chimay', 'bleue']);
    assert.deepStrictEqual(nameTokens('Coca-Cola carton de 6 canette'), ['coca', 'cola']);
  }],
  ['tokens: packaging words « bouteille », « btl », « fût »', () => assert.deepStrictEqual(nameTokens('Btl Leffe Blonde fût 30L'), ['leffe', 'blonde'])],
  ['tokens: apostrophe in a brand kept glued', () => assert.deepStrictEqual(nameTokens("Hendrick's Gin"), ['hendricks', 'gin'])],
  ['tokens: French elision', () => assert.deepStrictEqual(nameTokens("Jus d'orange pressé"), ['jus', 'orange', 'presse'])],
  ['tokens: dotted acronyms', () => assert.deepStrictEqual([nameTokens('Cognac V.S.O.P'), nameTokens('Rémy Martin X.O.')], [['cognac', 'vsop'], ['remy', 'martin', 'xo']])],
  ['tokens: long reference code dropped, short numbers kept', () => assert.deepStrictEqual(nameTokens('102345 Get 27 Liqueur 70cl'), ['get', '27', 'liqueur'])],
  ['tokens: « 1664 » is not a vintage', () => assert.deepStrictEqual(nameTokens('Kronenbourg 1664'), ['kronenbourg', '1664'])],
  ['tokens: œ ligature', () => assert.deepStrictEqual(nameTokens('Bœuf'), ['boeuf'])],
  ['tokens: nothing usable', () => assert.deepStrictEqual(nameTokens('Bouteille 70cl'), [])],
  ['lightKey ignores accents, case and spaces only', () => assert.strictEqual(lightKey('  Côtes   du RHÔNE '), 'cotes du rhone')],
  ['supplier key drops legal forms', () => assert.strictEqual(normaliseSupplier('FRANCE BOISSONS SAS'), normaliseSupplier('France Boissons'))],
  ['supplier key: empty', () => assert.strictEqual(normaliseSupplier(null), '')],
  ['alias key: name + container, vintage ignored', () => {
    assert.strictEqual(aliasNameKey('CDR Rge 2022', 75), 'cdr rge|75');
    assert.strictEqual(aliasNameKey('CDR Rge 2023', 75), aliasNameKey('CDR Rge 2022', 75));
    assert.notStrictEqual(aliasNameKey('Jameson 70cl', 70), aliasNameKey('Jameson 1L', 100));
    assert.strictEqual(aliasNameKey('Bouteille 70cl', 70), null);
  }],

  // --- token and name scores ---
  ['edit distance with transposition', () => assert.deepStrictEqual([editDistance('tanqeuray', 'tanqueray'), editDistance('whisky', 'whiskey')], [1, 1])],
  ['token: typo', () => assert.ok(tokenSimilarity('whisky', 'whiskey') > 0.8)],
  ['token: abbreviation « rge » / « blc »', () => assert.deepStrictEqual([tokenSimilarity('rge', 'rouge'), tokenSimilarity('blc', 'blanc')], [0.8, 0.8])],
  ['token: « gin » is not « ginger »', () => assert.strictEqual(tokenSimilarity('gin', 'ginger'), 0)],
  ['token: « rose » is not « rouge »', () => assert.strictEqual(tokenSimilarity('rose', 'rouge'), 0)],
  ['token: numbers must be equal', () => assert.strictEqual(tokenSimilarity('12', '18'), 0)],
  ['score: « Côtes du Rhône Rouge 2022 » = « Côtes du Rhône rouge »', () => assert.strictEqual(nameSimilarity('Côtes du Rhône Rouge 2022', 'Côtes du Rhône rouge'), 1)],
  ['score: invoice abbreviation « CÔTES DU RHÔNE RGE »', () => assert.ok(nameSimilarity('CÔTES DU RHÔNE RGE 2022 75CL', 'Côtes du Rhône rouge') >= FUZZY_THRESHOLD)],
  ['score: OCR typo « JAMESON IRISH WHISKY »', () => assert.ok(nameSimilarity('JAMESON IRISH WHISKY', 'Jameson Irish Whiskey') >= 0.9)],
  ['score: generic word weighs less (« Absolut Vodka Blue » / « Absolut Blue »)', () => assert.ok(nameSimilarity('Absolut Vodka Blue 1L', 'Absolut Blue') >= FUZZY_THRESHOLD)],
  ['score: rosé vs rouge stays under the threshold', () => assert.ok(nameSimilarity('Côtes du Rhône Rosé', 'Côtes du Rhône rouge') < FUZZY_THRESHOLD)],
  ['score: other beer of the brand under the threshold', () => assert.ok(nameSimilarity('Leffe Blonde', 'Leffe Ruby') < FUZZY_THRESHOLD)],
  ['score: different ages capped at 0,5', () => assert.strictEqual(nameSimilarity('Chivas Regal 12 ans', 'Chivas Regal 18 ans'), 0.5)],
  ['score: brand only is a candidate, not a match', () => {
    const s = nameSimilarity('Jameson Irish Whiskey 70cl 40%', 'Jameson');
    assert.ok(s >= CANDIDATE_MIN_SCORE && s < FUZZY_THRESHOLD, String(s));
  }],
  ['score: unrelated names', () => assert.ok(nameSimilarity('Schweppes Tonic', 'Chartreuse Verte') < CANDIDATE_MIN_SCORE)],
  ['score: symmetric', () => assert.strictEqual(nameSimilarity('Leffe Triple', 'Leffe Tripel fût'), nameSimilarity('Leffe Tripel fût', 'Leffe Triple'))],
  ['score: empty names', () => assert.strictEqual(nameSimilarity('Bouteille 70cl', 'Jameson'), 0)],

  // --- matching order and container ---
  ['match: exact name + container', () => assert.deepStrictEqual(pick(match("HENDRICK'S GIN", 70)), ['hendricks', 'exact', 1])],
  ['match: « Côtes du Rhône Rouge 2022 » 75 cl → fuzzy « Côtes du Rhône rouge »', () => assert.deepStrictEqual(pick(match('Côtes du Rhône Rouge 2022', 75)), ['cdr', 'fuzzy', 1])],
  ['match: different volume → none', () => assert.strictEqual(match('Côtes du Rhône Rouge 2022', 150), null)],
  ['match: container within ± 1 cl', () => assert.deepStrictEqual(pick(match('Côtes du Rhône Rouge 2022', 75.5)), ['cdr', 'fuzzy', 1])],
  ['match: the right size of the same name', () => assert.deepStrictEqual(pick(match('Jameson Irish Whiskey', 100)), ['jameson-1l', 'exact', 1])],
  ['match: rosé line never updates the rouge', () => assert.strictEqual(match('Côtes du Rhône Rosé 2023', 75)?.product.id, 'cdr-rose')],
  ['match: different age → none', () => assert.strictEqual(match('Chivas Regal 18 ans', 70), null)],
  ['match: keg of another beer → none', () => assert.strictEqual(match('Leffe Ruby fût 30L', 3000)?.product.id, 'leffe-ruby')],
  ['match: alias when no exact name', () => assert.deepStrictEqual(pick(match('Chartreuse V.E.P. 70cl', 70, CATALOG[8])), ['chartreuse', 'alias', 1])],
  ['match: exact name wins over alias', () => assert.deepStrictEqual(pick(match("Hendrick's Gin", 70, CATALOG[8])), ['hendricks', 'exact', 1])],
  ['match: alias wins over fuzzy', () => assert.deepStrictEqual(pick(match('Côtes du Rhône Rouge 2022', 75, CATALOG[8])), ['chartreuse', 'alias', 1])],
  ['match: oldest of two exact names', () => {
    const two = [P('new', 'Aperol', 70, '2026-05-01T00:00:00Z'), P('old', 'Aperol', 70, '2025-01-01T00:00:00Z')];
    assert.strictEqual(findMatch({ name: 'APEROL', containerVolumeCl: 70 }, two)?.product.id, 'old');
  }],
  ['candidates: other volume listed, best first, ≤ 3, never the match', () => {
    const c = findCandidates({ name: 'Côtes du Rhône Rouge 2022', containerVolumeCl: 150 }, CATALOG);
    assert.strictEqual(c[0].productId, 'cdr');
    assert.ok(c.length <= 3 && c.every((x, i) => i === 0 || c[i - 1].score >= x.score));
    const m = findCandidates({ name: 'Côtes du Rhône Rouge 2022', containerVolumeCl: 75 }, CATALOG, 'cdr');
    assert.ok(m.every((x) => x.productId !== 'cdr'));
  }],
  ['candidates: same container first on equal score', () => {
    const c = findCandidates({ name: 'Jameson Irish Whiskey 70cl', containerVolumeCl: 70 }, CATALOG);
    assert.deepStrictEqual(c.slice(0, 2).map((x) => x.productId), ['jameson', 'jameson-1l']);
  }],
  ['candidates: look-alike under the fuzzy threshold', () => {
    const c = findCandidates({ name: 'Chartreuse V.E.P. 70cl', containerVolumeCl: 70 }, CATALOG);
    assert.strictEqual(c[0]?.productId, 'chartreuse');
  }],
  ['match: alias product preferred among same-name products (a « Nouveau produit » with an existing name)', () => {
    const two = [P('old', 'Côtes du Rhône rouge', 75, '2025-01-01T00:00:00Z'), P('created', 'Côtes du Rhône rouge', 75, '2026-05-01T00:00:00Z')];
    assert.deepStrictEqual(pick(findMatch({ name: 'Côtes du Rhône rouge', containerVolumeCl: 75 }, two, two[1])), ['created', 'exact', 1]);
    assert.strictEqual(findMatch({ name: 'Côtes du Rhône rouge', containerVolumeCl: 75 }, two)?.product.id, 'old');
  }],

  // --- the « brand + one more word » class: candidates, never automatic matches ---
  ...([
    ["Jack Daniel's Honey 35% 70cl", "Jack Daniel's"],
    ['Coca-Cola Cherry 33cl', 'Coca-Cola 33 cl'],
    ['Coca-Cola Light 33cl', 'Coca-Cola 33 cl'],
    ['Coca Cola 33cl', 'Coca-Cola Zero 33 cl'],
    ['Bombay Sapphire East 70cl', 'Bombay Sapphire'],
    ['Grey Goose La Poire 70cl', 'Grey Goose'],
    ['Côtes du Rhône Villages 2021', 'Côtes du Rhône'],
    ['Montagne Saint-Émilion 2019', 'Saint-Émilion'],
    ['Lussac Saint-Émilion', 'Saint-Émilion'],
    ['Montagne Saint-Émilion Grand Cru', 'Saint-Émilion Grand Cru'],
    ['Mort Subite Kriek', 'Mort Subite'],
    ['Monkey Shoulder Smokey', 'Monkey Shoulder'],
    ['Estrella Galicia 1906', 'Estrella Galicia'],
    ["Jack Daniel's Tennessee Honey", "Jack Daniel's Tennessee Whiskey"],
    ['Kronenbourg 1664 25cl', 'Kronenbourg'],
  ] as [string, string][]).map(([line, product]): [string, () => void] => [
    `no automatic match: « ${line} » / « ${product} »`,
    () => {
      const s = nameSimilarity(line, product);
      assert.ok(s < FUZZY_THRESHOLD, `${s}`);
      assert.strictEqual(findMatch({ name: line, containerVolumeCl: 70 }, [P('x', product, 70)]), null);
    },
  ]),
  ['the same class stays a candidate (score 0,79)', () => {
    const c = findCandidates({ name: 'Coca-Cola Cherry 33cl', containerVolumeCl: 33 }, [P('coca', 'Coca-Cola 33 cl', 33)]);
    assert.deepStrictEqual(c.map((x) => [x.productId, x.score]), [['coca', UNMATCHED_WORD_CAP]]);
  }],
  ...([
    ['Monin Vanille 70cl', 'Monin Sirop Vanille'],
    ["Hendrick's 70cl", "Hendrick's Gin"],
    ['HENDRICKS GIN 70 CL', "Hendrick's Gin"],
    ['Tanqueray London Dry Gin 70cl', 'Tanqueray London Dry'],
    ['Chivas Regal 12 YO 70cl', 'Chivas Regal 12 ans'],
    ['CÔTES DU RHÔNE RGE 2022 75CL', 'Côtes du Rhône rouge'],
    ['Château Lamothe Bordeaux Supérieur 2020', 'Bordeaux Supérieur Château Lamothe'],
    ['Rhum Diplo. Reserva', 'Rhum Diplomático Reserva'],
  ] as [string, string][]).map(([line, product]): [string, () => void] => [
    `automatic match kept: « ${line} » / « ${product} »`,
    () => assert.ok(nameSimilarity(line, product) >= FUZZY_THRESHOLD, `${nameSimilarity(line, product)}`),
  ]),
  ['vintages are 1950–2099 only', () => {
    assert.deepStrictEqual(nameTokens('Saint-Émilion 1998'), ['saint', 'emilion']);
    assert.deepStrictEqual(nameTokens('Estrella Galicia 1906'), ['estrella', 'galicia', '1906']);
    assert.deepStrictEqual(nameTokens('Alhambra Reserva 1925 33cl'), ['alhambra', 'reserva', '1925']);
  }],
  ['names over 12 tokens are capped, over 20 never scored', () => {
    const w = Array.from({ length: 14 }, (_, i) => `mot${String.fromCharCode(97 + i)}x`).join(' ');
    assert.strictEqual(nameSimilarity(w, w), UNMATCHED_WORD_CAP);
    assert.strictEqual(findMatch({ name: `${w} suite`, containerVolumeCl: 70 }, [P('w', `${w} suite`, 70)])?.reason, 'exact');
    const long = Array.from({ length: 22 }, (_, i) => `mot${String.fromCharCode(97 + i)}y`).join(' ');
    assert.strictEqual(nameSimilarity(long, long), 0);
  }],
  ['index: a big catalogue still finds the match and the candidates', () => {
    const big = new CatalogIndex([...Array.from({ length: 1500 }, (_, i) => P(`f${i}`, `Filler ${i} Spécial ${['Gin', 'Rhum', 'Vin'][i % 3]}`, 70)), ...CATALOG]);
    assert.deepStrictEqual(pick(findMatch({ name: 'Côtes du Rhône Rouge 2022', containerVolumeCl: 75 }, big)), ['cdr', 'fuzzy', 1]);
    const a = analyseLine({ name: 'Chartreuse V.E.P. 70cl', containerVolumeCl: 70 }, big, { candidates: 3 });
    assert.strictEqual(a.candidates[0]?.productId, 'chartreuse');
  }],

  // --- bounded work (one Node process serves every user) ---
  ...perfTests(),
];

function perfTests(): [string, () => void][] {
  let seed = 42;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const word = (len: number) => Array.from({ length: len }, () => 'abcdefghijklmnopqrstuvwxyz'[rnd(26)]).join('');
  const flavours = 'rouge blanc rose reserve vieux premium extra brut sec doux ambre blonde brune triple gold black spiced honey cherry vanille fraise citron orange peche poire pomme cassis framboise ananas mangue coco menthe caramel cafe'.split(' ');
  const catalogue = () => Array.from({ length: 2000 }, (_, i) => P(`p${i}`, `${word(4 + rnd(6))} ${word(4 + rnd(6))} ${flavours[rnd(flavours.length)]} ${flavours[rnd(flavours.length)]} ${i}`, [70, 75, 33, 100][i % 4]));
  /** Preview of `lines` against `products`: total ms and the longest run of 10 lines (the preview yields every 10). */
  const preview = (products: ReturnType<typeof P>[], lines: { name: string; containerVolumeCl: number }[]) => {
    const t0 = Date.now();
    const index = new CatalogIndex(products);
    let block = 0;
    for (let i = 0; i < lines.length; i += 10) {
      const b = Date.now();
      for (const l of lines.slice(i, i + 10)) analyseLine(l, index, { candidates: 3 });
      block = Math.max(block, Date.now() - b);
    }
    const total = Date.now() - t0;
    console.log(`  perf: ${lines.length} lines × ${products.length} products: ${total} ms (longest 10 lines: ${block} ms)`);
    return { total, block };
  };
  const real = catalogue();
  const words200 = () => { let s = ''; while (s.length < 200) s += `${rnd(3) ? flavours[rnd(flavours.length)] : rnd(999)} `; return s.slice(0, 200); };
  const random4 = () => Array.from({ length: 40 }, () => word(4)).join(' ').slice(0, 200);
  const realistic = () => `${real[rnd(2000)].name.split(' ').slice(0, 3).join(' ')} ${flavours[rnd(flavours.length)]} 70cl 40%`;
  const base = Array.from({ length: 12 }, () => word(15));
  const nearCopy = () => base.map((t) => { const a = t.split(''); a[3 + rnd(12)] = word(1); return a.join(''); }).join(' ');
  return [
    ['perf: 200 realistic lines × 2 000 products under 1 s', () => {
      const { total } = preview(real, Array.from({ length: 200 }, () => ({ name: realistic(), containerVolumeCl: 70 })));
      assert.ok(total < 1000, `${total} ms`);
    }],
    ['perf: 200 lines × 200 characters (words and digits) × 2 000 products under 1 s', () => {
      const { total } = preview(real, Array.from({ length: 200 }, () => ({ name: words200(), containerVolumeCl: 70 })));
      assert.ok(total < 1000, `${total} ms`);
    }],
    ['perf: 200 lines × 200 characters (random 4-letter words) × 2 000 products under 1 s', () => {
      const { total } = preview(real, Array.from({ length: 200 }, () => ({ name: random4(), containerVolumeCl: 70 })));
      assert.ok(total < 1000, `${total} ms`);
    }],
    ['perf: worst case (12 long near-identical tokens × 2 000 look-alikes) bounded, 10 lines under 250 ms', () => {
      const products = Array.from({ length: 2000 }, (_, i) => P(`a${i}`, nearCopy(), 70));
      const { total, block } = preview(products, Array.from({ length: 200 }, () => ({ name: nearCopy(), containerVolumeCl: 70 })));
      assert.ok(total < 3000 && block < 250, `${total} ms, block ${block} ms`);
    }],
  ];
}

function pick(m: ReturnType<typeof match>) {
  return m ? [m.product.id, m.reason, m.score] : null;
}

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
  } catch (e: any) {
    failed++;
    console.log(`FAIL ${name}: ${String(e.message).split('\n').slice(0, 3).join(' | ')}`);
  }
}
console.log(`invoice matcher: ${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
