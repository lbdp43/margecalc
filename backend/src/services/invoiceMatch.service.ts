/**
 * Invoice line ↔ catalogue matching (POST /api/products/import and /import/preview).
 *
 * A line is linked to an existing product in this order:
 *   1. 'exact' — same name once accents, case and spaces are ignored (`lightKey`), same container (± 1 cl).
 *      With several, the product the supplier's label is remembered for (alias) wins, then the closest
 *      container, then the oldest product;
 *   2. 'alias' — the user already linked this supplier's label (same normalised name + container) to a
 *      product (table "InvoiceAlias");
 *   3. 'fuzzy' — same container (± 1 cl) and a name similarity ≥ FUZZY_THRESHOLD (0,8).
 * Without any, the import creates a product.
 *
 * Name similarity (0–1), see `nameSimilarity`:
 * - both names are normalised (`nameTokens`): lowercase, accents and punctuation removed, French
 *   elisions (« d'orange » → « orange »), dotted acronyms (« V.S.O.P » → « vsop »),
 *   vintages (1950–2099; older numbers such as « 1906 » or « 1664 » are product names and are kept),
 *   volumes (« 70cl », « 0,75 L »), degrees (« 40 % vol »), packs (« x24 », « carton de 6 »),
 *   long reference codes (≥ 5 digits) and packaging / filler words (« bouteille », « btl », « fût »,
 *   « canette », « de », « du »…) are dropped;
 * - every token is compared to the best token of the other name: identical = 1, prefix (≥ 4 letters)
 *   = 0,9, abbreviation (« rge » for « rouge », « blc » for « blanc »: same first and last letter) = 0,8,
 *   1–2 typos = 1 − d / length (the best of these)
 *   (pairs under 0,75 count 0); numbers must be identical;
 * - the score is a weighted Dice coefficient: generic words (« whisky », « gin », « vin », « château »,
 *   « ans »…) weigh 0,4, the others 1;
 * - two names whose numbers disagree (« Chivas 12 ans » / « Chivas 18 ans ») score at most 0,5;
 * - a distinctive (non-generic) word of either name that has no counterpart in the other caps the score
 *   at 0,79 (UNMATCHED_WORD_CAP): « Coca-Cola Cherry » / « Coca-Cola », « Montagne Saint-Émilion » /
 *   « Saint-Émilion » or « Sauvignon Touraine » / « Sauvignon Blanc Touraine » are offered as candidates,
 *   never linked automatically. Only generic words, spelling, abbreviations, vintages, volumes and
 *   packaging may differ in a 'fuzzy' match;
 * - only the first 12 tokens of a name are compared (a longer name is capped at 0,79 as well), and a name
 *   with more than 20 tokens is never scored (exact / alias only).
 * The score is rounded to 2 decimals before it is compared with the thresholds.
 *
 * Work per line is bounded: a line is scored against at most MAX_SCORED_PRODUCTS (300) same-container
 * products for its match and 300 products for its candidates — the whole catalogue when it is that
 * small, otherwise the products sharing the most token prefixes (3 first letters) with the line.
 *
 * « Côtes du Rhône Rouge 2022 » and « Côtes du Rhône rouge » both give [cotes, rhone, rouge]: score 1.
 */
import { IMPORT_CANDIDATE_MIN_SCORE, IMPORT_FUZZY_THRESHOLD, ImportCandidate, ImportMatchReason } from '@margebar/shared';

export const FUZZY_THRESHOLD = IMPORT_FUZZY_THRESHOLD;
export const CANDIDATE_MIN_SCORE = IMPORT_CANDIDATE_MIN_SCORE;
/** Containers within ± 1 cl are the same container (exact and fuzzy matches). */
export const CONTAINER_TOLERANCE_CL = 1;
/** Capped score when the two names carry different numbers (ages, references). */
export const NUMBER_CONFLICT_CAP = 0.5;
/** Capped score when a distinctive word has no counterpart (or a name was cut): a candidate, never a match. */
export const UNMATCHED_WORD_CAP = 0.79;
/** Tokens of a name that are compared (the rest is ignored, and the score capped). */
export const MAX_SCORED_TOKENS = 12;
/** A name with more tokens is never scored: it can only match 'exact' or 'alias'. */
export const MAX_FUZZY_TOKENS = 20;
/** Products scored per line (for the match, and again for the candidates). */
export const MAX_SCORED_PRODUCTS = 300;
/**
 * Token comparisons per line for its match, and as many again for its candidates (about 2 ms each).
 * A real invoice line against a real catalogue needs a few thousand; a line built to be slow stops
 * there, the products sharing the fewest token prefixes with it being left out first.
 */
export const MATCH_PAIR_BUDGET = 6_000;
const MAX_TOKEN_CHARS = 30;
const MIN_TOKEN_SIM = 0.75;
const GENERIC_WEIGHT = 0.4;

/** Removed before comparing: articles, packaging and invoice filler. */
const STOPWORDS = new Set([
  'de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'en', 'au', 'aux', 'a', 'un', 'une', 'pour', 'avec',
  'the', 'of', 'and',
  'bouteille', 'bouteilles', 'btl', 'btle', 'btlle', 'blle', 'bt', 'bout', 'bte', 'boite', 'canette', 'canettes',
  'cannette', 'can', 'cans', 'fut', 'futs', 'keg', 'vp', 'vc', 'perdu', 'consigne', 'pack', 'carton', 'caisse',
  'colis', 'lot', 'unite', 'unites', 'u', 'pc', 'pcs', 'piece', 'pieces', 'x', 'cl', 'ml', 'dl', 'lt', 'ltr',
  'litre', 'litres', 'vol', 'aoc', 'aop', 'igp',
]);

/** Kept, but weigh less: they say what the product is, not which one it is. */
const GENERIC = new Set([
  'whisky', 'whiskey', 'scotch', 'bourbon', 'vodka', 'gin', 'rhum', 'rum', 'tequila', 'mezcal', 'cognac',
  'armagnac', 'calvados', 'liqueur', 'creme', 'sirop', 'biere', 'vin', 'champagne', 'cidre', 'jus', 'soda',
  'tonic', 'aperitif', 'single', 'malt', 'blended', 'irish', 'london', 'dry', 'ans', 'yo', 'year', 'years',
  'chateau', 'domaine', 'cuvee', 'maison',
]);

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** 'exact' key: accents, case and repeated spaces ignored (the rule of the import before Lot 2). */
export function lightKey(name: string): string {
  return stripAccents(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Normalised tokens of a product name (see the header). */
export function nameTokens(name: string): string[] {
  let s = stripAccents(String(name ?? '')).toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[’‘`´]/g, "'");
  // French elisions: « jus d'orange » → « jus orange », « l'Abbaye » → « abbaye ».
  s = s.replace(/(^|[^a-z0-9])(?:qu|[cdjlmnst])'(?=[a-z])/g, '$1 ');
  // Other apostrophes are part of the word: « Hendrick's » → « hendricks ».
  s = s.replace(/'/g, '');
  // Dotted acronyms are one word: « V.S.O.P » → « vsop », « X.O. » → « xo », « V.E.P. » → « vep ».
  s = s.replace(/\b(?:[a-z]\.){1,}[a-z]\b\.?/g, (m) => m.replace(/\./g, ''));
  // Glued numbers and words: « 70cl » → « 70 cl », « get27 » → « get 27 », « x24 » → « x 24 ».
  s = s.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
  // Packs: « carton de 6 », « pack 24 », « x24 », « 24x », « 6 x 33cl ».
  s = s.replace(/(^|[^a-z0-9])(?:pack|carton|caisse|colis|lot|cs|crt|ct)\s*(?:de\s*)?\d+(?![a-z0-9])/g, '$1 ');
  s = s.replace(/(^|[^a-z0-9])[x×*]\s*\d+(?![a-z0-9]|[.,]\d)/g, '$1 ');
  s = s.replace(/(^|[^a-z0-9.,])\d+\s*[x×*](?=[\s\d]|$)/g, '$1 ');
  // Volumes: « 70cl », « 75 cl », « 0,75 L », « 1.5l », « 700 ml », « 30 litres ».
  s = s.replace(/(^|[^a-z0-9])\d+(?:[.,]\d+)?\s*(?:cl|ml|dl|l|lt|ltr|litres?|liters?)(?![a-z0-9])/g, '$1 ');
  // Degrees: « 40% », « 40 % vol. », « 12,5° », « 5.5 deg ».
  s = s.replace(/\d+(?:[.,]\d+)?\s*(?:%|°|deg)(?:\s*vol\b\.?)?/g, ' ');
  // Vintages: 1950–2099 (2022, 1998…). Older years are product names: « Estrella Galicia 1906 ».
  s = s.replace(/(^|[^a-z0-9])(?:19[5-9]\d|20\d{2})(?![a-z0-9])/g, '$1 ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.split(' ').filter((t) => t && !STOPWORDS.has(t) && !/^\d{5,}$/.test(t));
}

/** Normalised name as one string (tokens joined by a space). */
export function normaliseName(name: string): string {
  return nameTokens(name).join(' ');
}

/** Supplier key of the alias table: lowercase, no accents/punctuation, legal forms dropped. '' = unknown. */
export function normaliseSupplier(supplier: string | null | undefined): string {
  const s = stripAccents(String(supplier ?? '')).toLowerCase().replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, ' ');
  const LEGAL = new Set(['sas', 'sasu', 'sarl', 'sa', 'eurl', 'snc', 'sca', 'scea', 'ste', 'societe', 'ets', 'etablissements', 'cie']);
  return s.split(' ').filter((t) => t && !LEGAL.has(t)).join(' ');
}

/** Container part of an alias key, to 0,1 cl. */
const containerKey = (cl: number) => String(Math.round(cl * 10) / 10);

/** Alias key of a line: « <normalised name>|<container> », or null when the name has no usable word. */
export function aliasNameKey(name: string, containerVolumeCl: number): string | null {
  const n = normaliseName(name);
  return n ? `${n}|${containerKey(containerVolumeCl)}`.slice(0, 300) : null;
}

export function sameContainer(a: number, b: number): boolean {
  return Math.abs(a - b) <= CONTAINER_TOLERANCE_CL + 1e-9;
}

// Reused rows of `editDistance` (no allocation per call).
let rowA = new Int32Array(64);
let rowB = new Int32Array(64);
let rowC = new Int32Array(64);

const FAR = 1 << 20;

/**
 * Optimal string alignment distance (Levenshtein + adjacent transpositions), stopping early:
 * any result above `max` is reported as `max + 1`. With a finite `max`, only the diagonal band
 * |i − j| ≤ max is computed (O(length × max)).
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  if (!n) return m;
  if (!m) return n;
  if (rowA.length < m + 2) {
    rowA = new Int32Array(m + 2);
    rowB = new Int32Array(m + 2);
    rowC = new Int32Array(m + 2);
  }
  const band = Number.isFinite(max) ? max : Math.max(n, m);
  let prev2 = rowA;
  let prev = rowB;
  let cur = rowC;
  for (let j = 0; j <= m + 1; j++) prev[j] = j <= band ? j : FAR;
  for (let i = 1; i <= n; i++) {
    const lo = Math.max(1, i - band);
    const hi = Math.min(m, i + band);
    cur[lo - 1] = lo === 1 ? i : FAR;
    if (hi < m) cur[hi + 1] = FAR;
    let rowMin = lo === 1 ? i : FAR;
    const ai = a.charCodeAt(i - 1);
    for (let j = lo; j <= hi; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = prev[j - 1] + (ai === bj ? 0 : 1);
      if (prev[j] + 1 < v) v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj && prev2[j - 2] + 1 < v) v = prev2[j - 2] + 1;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return Math.min(prev[m], max + 1);
}

function isNumber(t: string): boolean {
  if (!t) return false;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (let k = 0; k < long.length && i < short.length; k++) if (long[k] === short[i]) i++;
  return i === short.length;
}

function computeTokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (isNumber(a) || isNumber(b)) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3) return 0;
  if (long.startsWith(short)) return short.length >= 4 ? 0.9 : 0;
  let best = 0;
  // Invoice abbreviations: « rge » → rouge, « blc » → blanc, « rse » → rosé (same first and last letter).
  if (short[0] === long[0] && short[short.length - 1] === long[long.length - 1]
    && short.length >= long.length * 0.5 && isSubsequence(short, long)) best = 0.8;
  if (short.length >= 4) {
    const allowed = short.length >= 7 ? 2 : 1;
    const d = editDistance(a, b, allowed);
    if (d <= allowed) best = Math.max(best, 1 - d / long.length);
  }
  return best;
}

/** Similarity of two normalised tokens (0–1). */
export function tokenSimilarity(a: string, b: string): number {
  return computeTokenSimilarity(a, b);
}

const weight = (t: string) => (GENERIC.has(t) ? GENERIC_WEIGHT : 1);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What scoring needs from a name, computed once per distinct name. */
export interface NameKeys {
  light: string;
  /** Compared tokens: the first MAX_SCORED_TOKENS, each cut to MAX_TOKEN_CHARS. */
  tokens: string[];
  numbers: string[];
  generic: boolean[];
  totalWeight: number;
  /** More than MAX_SCORED_TOKENS tokens: the score is capped (candidate only). */
  truncated: boolean;
  /** More than MAX_FUZZY_TOKENS tokens: never scored. */
  tooLong: boolean;
  /** Distinct 3-letter prefixes of the compared tokens (catalogue index keys). */
  prefixes: string[];
  /** Prefixes a line looks up: those of its distinctive tokens (all its tokens when it has none). */
  lookup: string[];
}

const prefixOf = (t: string) => t.slice(0, 3);

function keysFromTokens(light: string, all: string[]): NameKeys {
  const tokens = all.slice(0, MAX_SCORED_TOKENS).map((t) => t.slice(0, MAX_TOKEN_CHARS));
  const generic = tokens.map((t) => GENERIC.has(t));
  const distinctive = tokens.filter((_, i) => !generic[i]);
  return {
    light,
    tokens,
    numbers: tokens.filter(isNumber),
    generic,
    totalWeight: tokens.reduce((s, t) => s + weight(t), 0),
    truncated: all.length > MAX_SCORED_TOKENS,
    tooLong: all.length > MAX_FUZZY_TOKENS,
    prefixes: [...new Set(tokens.map(prefixOf))],
    lookup: [...new Set((distinctive.length ? distinctive : tokens).map(prefixOf))],
  };
}

/** Keys per name (catalogue names repeat across the lines of an invoice and across invoices). */
const keysCache = new Map<string, NameKeys>();
export function nameKeys(name: string): NameKeys {
  let k = keysCache.get(name);
  if (!k) {
    if (keysCache.size > 50_000) keysCache.clear();
    k = keysFromTokens(lightKey(name), nameTokens(name));
    keysCache.set(name, k);
  }
  return k;
}

/**
 * Scores many names against one line: the similarity of each line token to a catalogue token is
 * computed once per distinct catalogue token, and both directions of the Dice sum are read from it.
 */
class LineScorer {
  private readonly rows = new Map<string, Float64Array>();
  private readonly bestA: Float64Array;
  /** Token comparisons made so far (the per-line budget, see MATCH_PAIR_BUDGET). */
  pairs = 0;

  constructor(private readonly line: NameKeys) {
    this.bestA = new Float64Array(line.tokens.length);
  }

  private row(u: string): Float64Array {
    let r = this.rows.get(u);
    if (!r) {
      const t = this.line.tokens;
      r = new Float64Array(t.length);
      for (let i = 0; i < t.length; i++) r[i] = computeTokenSimilarity(t[i], u);
      this.pairs += t.length;
      this.rows.set(u, r);
    }
    return r;
  }

  score(other: NameKeys): number {
    const line = this.line;
    const n = line.tokens.length;
    if (!n || !other.tokens.length || line.tooLong || other.tooLong) return 0;
    const bestA = this.bestA;
    bestA.fill(0);
    let gotB = 0;
    let unmatched = 0;
    for (let k = 0; k < other.tokens.length; k++) {
      const u = other.tokens[k];
      const r = this.row(u);
      let best = 0;
      for (let i = 0; i < n; i++) {
        if (r[i] > best) best = r[i];
        if (r[i] > bestA[i]) bestA[i] = r[i];
      }
      if (best >= MIN_TOKEN_SIM) gotB += weight(u) * best;
      else if (!other.generic[k]) unmatched++;
    }
    let gotA = 0;
    for (let i = 0; i < n; i++) {
      if (bestA[i] >= MIN_TOKEN_SIM) gotA += weight(line.tokens[i]) * bestA[i];
      else if (!line.generic[i]) unmatched++;
    }
    let score = (gotA + gotB) / (line.totalWeight + other.totalWeight);
    if (line.numbers.some((x) => !other.numbers.includes(x)) && other.numbers.some((x) => !line.numbers.includes(x))) {
      score = Math.min(score, NUMBER_CONFLICT_CAP);
    }
    // A distinctive word without counterpart (« Cherry », « Montagne », « Blanc »…), or a name too long
    // to be compared in full: offered as a candidate, never linked automatically.
    if (unmatched > 0 || line.truncated || other.truncated) score = Math.min(score, UNMATCHED_WORD_CAP);
    return round2(Math.min(1, score));
  }
}

/** Name similarity (0–1, 2 decimals) of two names or two token lists. */
export function nameSimilarity(a: string | string[], b: string | string[]): number {
  const ka = Array.isArray(a) ? keysFromTokens(a.join(' '), a) : nameKeys(a);
  const kb = Array.isArray(b) ? keysFromTokens(b.join(' '), b) : nameKeys(b);
  return new LineScorer(ka).score(kb);
}

// ---------------------------------------------------------------------------
// Matching against a catalogue
// ---------------------------------------------------------------------------

export interface CatalogProduct {
  id: string;
  name: string;
  containerVolumeCl: number;
  createdAt: Date | string;
}

interface IndexedProduct<P> {
  p: P;
  k: NameKeys;
  created: number;
}

/**
 * Products of one request, indexed by light name and by token prefix. Add them oldest first (the
 * order breaks ties). `add` also takes products created during the request (preview of an invoice).
 */
export class CatalogIndex<P extends CatalogProduct> {
  readonly items: IndexedProduct<P>[] = [];
  private readonly byLight = new Map<string, number[]>();
  private readonly byPrefix = new Map<string, number[]>();
  private counts = new Uint16Array(64);

  constructor(products: Iterable<P> = []) {
    for (const p of products) this.add(p);
  }

  get size(): number {
    return this.items.length;
  }

  add(p: P): void {
    const i = this.items.length;
    const k = nameKeys(p.name);
    this.items.push({ p, k, created: new Date(p.createdAt).getTime() });
    const l = this.byLight.get(k.light);
    if (l) l.push(i);
    else this.byLight.set(k.light, [i]);
    if (!k.tooLong) {
      for (const pre of k.prefixes) {
        const b = this.byPrefix.get(pre);
        if (b) b.push(i);
        else this.byPrefix.set(pre, [i]);
      }
    }
  }

  /** Indices of the products whose light name is `light`. */
  sameLight(light: string): number[] {
    return this.byLight.get(light) ?? [];
  }

  /**
   * Up to MAX_SCORED_PRODUCTS indices among the products `accept` keeps, those sharing the most token
   * prefixes with the line first (then the oldest). When `accept` keeps that few products, all of them
   * are returned (the ones sharing no prefix last); otherwise only products sharing a prefix.
   */
  select(line: NameKeys, accept: (i: number) => boolean): number[] {
    if (this.counts.length < this.items.length) this.counts = new Uint16Array(this.items.length * 2);
    const counts = this.counts;
    const touched: number[] = [];
    for (const pre of line.lookup) {
      for (const i of this.byPrefix.get(pre) ?? []) {
        if (counts[i]++ === 0) touched.push(i);
      }
    }
    let pool: number[] = [];
    for (let i = 0; i < this.items.length; i++) if (accept(i) && !this.items[i].k.tooLong) pool.push(i);
    if (pool.length > MAX_SCORED_PRODUCTS) pool = touched.filter(accept);
    pool.sort((a, b) => counts[b] - counts[a] || a - b);
    for (const i of touched) counts[i] = 0;
    return pool.length > MAX_SCORED_PRODUCTS ? pool.slice(0, MAX_SCORED_PRODUCTS) : pool;
  }
}

export interface FoundMatch<P extends CatalogProduct> {
  product: P;
  score: number;
  reason: ImportMatchReason;
}

export interface LineAnalysis<P extends CatalogProduct> {
  match: FoundMatch<P> | null;
  candidates: ImportCandidate[];
}

export interface AnalyseOptions<P extends CatalogProduct> {
  /** The product this supplier's label is remembered for (its container is not checked: the user chose it). */
  alias?: P | null;
  /** How many candidates to return (0 = none). */
  candidates?: number;
  /** Compute the candidates only (no automatic match): `excludeId` is then the only product left out. */
  candidatesOnly?: boolean;
  excludeId?: string | null;
  /** Products that may not be offered as candidates (e.g. products not created yet). */
  candidateFilter?: (p: P) => boolean;
}

const toIndex = <P extends CatalogProduct>(c: P[] | CatalogIndex<P>) => (c instanceof CatalogIndex ? c : new CatalogIndex(c));

/**
 * The automatic match of one line (exact, then alias, then fuzzy) and up to `candidates` look-alike
 * products (score ≥ CANDIDATE_MIN_SCORE, any container, best first; on equal scores the same
 * container first, then the oldest), never the match. One scorer serves both.
 */
export function analyseLine<P extends CatalogProduct>(
  line: { name: string; containerVolumeCl: number },
  catalog: P[] | CatalogIndex<P>,
  opts: AnalyseOptions<P> = {},
): LineAnalysis<P> {
  const index = toIndex(catalog);
  const items = index.items;
  const lk = nameKeys(line.name);
  const cl = line.containerVolumeCl;
  const near = (i: number) => sameContainer(items[i].p.containerVolumeCl, cl);
  const byCloseness = (a: number, b: number) =>
    Math.abs(items[a].p.containerVolumeCl - cl) - Math.abs(items[b].p.containerVolumeCl - cl)
    || items[a].created - items[b].created || a - b;
  const scorer = lk.tokens.length && !lk.tooLong ? new LineScorer(lk) : null;
  const scores = new Map<number, number>();
  const scoreOf = (i: number) => {
    let s = scores.get(i);
    if (s === undefined) {
      s = items[i].k.light === lk.light ? 1 : scorer ? scorer.score(items[i].k) : 0;
      scores.set(i, s);
    }
    return s;
  };

  let match: FoundMatch<P> | null = null;
  if (!opts.candidatesOnly) {
    const alias = opts.alias ?? null;
    const exact = index.sameLight(lk.light).filter(near);
    if (exact.length) {
      // The label remembered for this supplier wins among same-name products (a « Nouveau produit »
      // created with the name of an existing one), else the closest container, then the oldest.
      const remembered = alias ? exact.find((i) => items[i].p.id === alias.id) : undefined;
      const i = remembered ?? exact.sort(byCloseness)[0];
      match = { product: items[i].p, score: 1, reason: 'exact' };
    } else if (alias) {
      match = { product: alias, score: 1, reason: 'alias' };
    } else if (scorer) {
      let best = -1;
      for (const i of index.select(lk, near)) {
        if (scorer.pairs >= MATCH_PAIR_BUDGET) break;
        const s = scoreOf(i);
        if (s < FUZZY_THRESHOLD) continue;
        if (best < 0 || s > scoreOf(best) || (s === scoreOf(best) && byCloseness(i, best) < 0)) best = i;
      }
      if (best >= 0) match = { product: items[best].p, score: scoreOf(best), reason: 'fuzzy' };
    }
  }

  const limit = opts.candidates ?? 0;
  if (!limit) return { match, candidates: [] };
  const excluded = new Set([opts.excludeId, match?.product.id].filter(Boolean) as string[]);
  const keep = (i: number) => !excluded.has(items[i].p.id) && (!opts.candidateFilter || opts.candidateFilter(items[i].p));
  const pool = new Set<number>(index.sameLight(lk.light).filter(keep));
  if (scorer) {
    const budget = scorer.pairs + MATCH_PAIR_BUDGET;
    for (const i of index.select(lk, keep)) {
      if (scorer.pairs >= budget) break;
      pool.add(i);
      scoreOf(i);
    }
  }
  const scored: { i: number; score: number; same: boolean }[] = [];
  for (const i of pool) {
    const score = scoreOf(i);
    if (score >= CANDIDATE_MIN_SCORE) scored.push({ i, score, same: near(i) });
  }
  scored.sort((a, b) => b.score - a.score || Number(b.same) - Number(a.same) || items[a.i].created - items[b.i].created || a.i - b.i);
  const candidates = scored.slice(0, limit).map(({ i, score }) => {
    const p = items[i].p;
    return { productId: p.id, name: p.name, containerVolumeCl: p.containerVolumeCl, score };
  });
  return { match, candidates };
}

/** Automatic match of one line (see `analyseLine`). Products in other containers are ignored. */
export function findMatch<P extends CatalogProduct>(
  line: { name: string; containerVolumeCl: number },
  products: P[] | CatalogIndex<P>,
  alias: P | null = null,
): FoundMatch<P> | null {
  return analyseLine(line, products, { alias }).match;
}

/** Up to `limit` products that look like the line (see `analyseLine`), never `excludeId`. */
export function findCandidates<P extends CatalogProduct>(
  line: { name: string; containerVolumeCl: number },
  products: P[] | CatalogIndex<P>,
  excludeId: string | null = null,
  limit = 3,
): ImportCandidate[] {
  return analyseLine(line, products, { candidatesOnly: true, excludeId, candidates: limit }).candidates;
}
