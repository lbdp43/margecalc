/**
 * DEV ONLY — component gallery of the D1 foundation.
 * Open http://localhost:8090/?gallery=1 (web + __DEV__ only, lazily required
 * from App.tsx so it never ships in the production bundle).
 * Screen agents: use it to check components and states; keep it up to date.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getMarginColor } from '@margebar/shared';
import type { ProductWithMargin } from '@margebar/shared';
import {
  AnimatedNumber,
  Avatar,
  Badge,
  BottomSheet,
  BrandMark,
  Button,
  Card,
  Chip,
  ChipRow,
  CompositionBar,
  dialog,
  Divider,
  EmptyState,
  FAB,
  FadeIn,
  FiscalCategorySheet,
  HeroHeader,
  IconButton,
  LargeTitleHeader,
  ListGroup,
  ListRow,
  MarginLegend,
  countByZone,
  Meter,
  NavBar,
  NumberInput,
  PriceTag,
  ProductActionsSheet,
  ProductCard,
  ResultGrid,
  ResultTile,
  Screen,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonProductCard,
  SkeletonStatTile,
  Slider,
  StatTile,
  StickyActionBar,
  SwapFade,
  TextField,
  toast,
  ValueRow,
  WelcomeModal,
  Wordmark,
  YinYangSpinner,
} from '../components/ui';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { fontFamily, palette, type } from '../theme';
import { haptics } from '../theme/haptics';
import { alert, confirm } from '../utils/alert';
import { formatCoeff, formatDegree, formatEuro, formatNumber, formatPercent } from '../utils/format';

const PURCHASE_HT = 32.5;
const DOSES = 14;

function marginFromPrice(ttc: number) {
  const ht = ttc / 1.2;
  const cost = PURCHASE_HT / DOSES;
  return { ht, cost, gain: ht - cost, margin: ht > 0 ? ((ht - cost) / ht) * 100 : 0, coeff: ht / cost };
}

const st = (id: string, name: string, volumeCl: number, sortOrder: number) => ({ id, userId: 'demo', name, volumeCl, icon: '', sortOrder });
const sv = (id: string, price: number, type: ReturnType<typeof st>) => ({ id, productId: 'p', servingTypeId: type.id, sellingPriceTTC: price, servingType: type });
const comp = (marginPercent: number, sellingPriceTTC: number, marginPerDoseHT: number) => ({
  sellingPriceTTC, sellingPriceHT: sellingPriceTTC / 1.2, marginPercent, coefficient: 3, glassesPerContainer: 14,
  costPerDoseHT: 1, marginPerDoseHT, revenuePerContainer: 0, marginPerContainer: 0, colorCode: 'green' as const,
});
// Dev-only demo data shaped like GET /api/products
const DEMO_PRODUCTS: ProductWithMargin[] = [
  {
    id: 'gin', name: 'Hendrick’s Gin', containerVolumeCl: 70, alcoholDegree: 41.4, thumbnailUrl: null,
    category: { id: 'c1', name: 'Spiritueux', slug: 'spiritueux', icon: '', sortOrder: 1 },
    servings: [sv('s1', 9, st('t1', 'Verre (spiritueux)', 5, 2)), sv('s2', 6, st('t0', 'Shot', 3, 1))],
    computed: comp(69, 6, 3.18),
  },
  {
    id: 'chablis', name: 'Chablis 1er cru Montmains', containerVolumeCl: 75, alcoholDegree: 12.5, thumbnailUrl: null,
    category: { id: 'c2', name: 'Vins', slug: 'vins', icon: '', sortOrder: 2 },
    servings: [sv('s3', 5.5, st('t3', 'Verre de vin', 12, 3))],
    computed: comp(42.7, 5.5, 1.96),
  },
  {
    id: 'hdd', name: 'Herbe des Druides', containerVolumeCl: 3000, alcoholDegree: 6.5, thumbnailUrl: null,
    category: { id: 'c3', name: 'Bières', slug: 'bieres', icon: '', sortOrder: 3 },
    servings: [sv('s4', 4, st('t4', 'Demi', 25, 4)), sv('s5', 7.5, st('t5', 'Pinte', 50, 5)), sv('s6', 2.5, st('t6', 'Galopin', 12, 6))],
    computed: comp(58.3, 4, 1.94),
  },
  {
    id: 'coca', name: 'Coca-Cola', containerVolumeCl: 33, alcoholDegree: 0, thumbnailUrl: null, doseVolumeCl: 33, sellingPriceTTC: 4,
    category: { id: 'c4', name: 'Softs & Jus', slug: 'softs', icon: '', sortOrder: 4 },
    servings: [],
    computed: comp(75.2, 4, 2.51),
  },
] as unknown as ProductWithMargin[];

function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error('Erreur simulée (galerie)');
  return <Text style={[type.callout, { color: palette.text2 }]}>Contenu protégé par ErrorBoundary.</Text>;
}

function Section({ title, children, meta }: { title: string; children: React.ReactNode; meta?: string }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} meta={meta} />
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

export function Gallery() {
  const [mode, setMode] = useState<'price' | 'margin' | 'coeff'>('price');
  const [price, setPrice] = useState(9);
  const [degree, setDegree] = useState(40);
  const [dragging, setDragging] = useState(false);
  const [cat, setCat] = useState('all');
  const [service, setService] = useState('verre5');
  const [sheet, setSheet] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [actionsFor, setActionsFor] = useState<{ name: string } | null>(null);
  const [fiscal, setFiscal] = useState('spiritueux');
  const [sw, setSw] = useState(true);
  const [sticky, setSticky] = useState(false);
  const [email, setEmail] = useState('');
  const [buy, setBuy] = useState('11,00');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [crash, setCrash] = useState(false);

  const m = useMemo(() => marginFromPrice(price), [price]);
  const zone = getMarginColor(m.margin);
  const objectivePrice = (PURCHASE_HT / DOSES / (1 - 0.65)) * 1.2;

  const save = () => {
    setSaving(true);
    setSaved(false);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      haptics.success();
      toast.success('Hendrick’s Gin enregistré', { action: { label: 'Voir', onPress: () => {} } });
      setTimeout(() => setSaved(false), 1400);
    }, 900);
  };

  const modeValue = mode === 'price' ? formatEuro(price) : mode === 'margin' ? formatPercent(m.margin) : formatCoeff(m.coeff);

  return (
    <Screen
      testID="gallery"
      stickyFooter={
        sticky ? (
          <StickyActionBar
            summary={`2 services · marge ${formatPercent(m.margin)}`}
            summaryZone={zone}
            summaryRight={`Coeff ${formatCoeff(m.coeff)}`}
            primary={{ title: 'Enregistrer', icon: 'checkmark-circle', onPress: save, loading: saving, success: saved }}
          />
        ) : undefined
      }
    >
      <LargeTitleHeader
        title="Galerie"
        subline={
          <>
            Fondation D1 · marge moy. <Text style={{ color: palette.good, fontFamily: fontFamily.semibold }}>{formatPercent(72.5)}</Text>
          </>
        }
        trailing={<FAB accessibilityLabel="Ajouter un produit" onPress={() => toast.info('FAB pressé')} />}
      />

      {/* HERO */}
      <View style={styles.bleed}>
        <HeroHeader paddingBottom={28} safeTop={false}>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <Avatar name="Le Comptoir Démo" variant="onEmerald" />
              <View style={{ marginLeft: 12 }}>
                <Text style={[type.callout, { color: palette.onEmerald2 }]}>Bonsoir,</Text>
                <Text style={[type.title2, { color: '#FFFFFF' }]}>Le Comptoir Démo</Text>
              </View>
            </View>
            <IconButton icon="chatbubble-ellipses-outline" variant="light" accessibilityLabel="Signaler un problème" />
          </View>
          <View style={[styles.rowBetween, { marginTop: 24 }]}>
            <Text style={[type.callout, { color: palette.onEmerald2, fontSize: 15 }]}>Marge moyenne</Text>
            <Badge variant="pillDark" icon="trending-up" label="+7,5 pts vs objectif" />
          </View>
          <AnimatedNumber
            value={72.5}
            format={(n) => formatNumber(n, 1)}
            suffix={' %'}
            suffixStyle={{ fontSize: 30, color: 'rgba(255,255,255,0.8)' }}
            style={[type.displayXL, { color: '#FFFFFF', marginTop: 4 }]}
          />
          <CompositionBar
            surface="emerald"
            style={{ marginTop: 18 }}
            segments={[
              { key: 'good', value: 15, color: palette.goodOnEmerald, label: '15 rentables' },
              { key: 'warn', value: 6, color: palette.warnOnEmerald, label: '6 à surveiller' },
              { key: 'bad', value: 3, color: palette.badOnEmerald, label: '3 à revoir' },
            ]}
            legend="labels"
          />
        </HeroHeader>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: -16 }}>
        <StatTile label="Produits" value={24} unit="suivis" icon="cube-outline" style={{ flex: 1 }} />
        <StatTile label="Meilleur produit" icon="trophy-outline" iconTone="trophy" style={{ flex: 1 }}>
          <View style={{ gap: 4 }}>
            <Text style={[type.headline, { color: palette.ink }]}>Apérol</Text>
            <Badge value={84.1} size="sm" />
          </View>
        </StatTile>
      </View>

      <Section title="Boutons">
        <Button title="Enregistrer" icon="checkmark-circle" onPress={save} loading={saving} success={saved} />
        <Button title="Chargement…" loading onPress={() => {}} />
        <Button title="Désactivé" disabled onPress={() => {}} />
        <Button title="Ajouter un service" variant="secondary" icon="add" onPress={() => {}} />
        <Button title="Ouvrir le calculateur" variant="tonal" trailingIcon="arrow-forward" onPress={() => {}} />
        <View style={styles.row}>
          <Button title="Annuler" variant="text" size="sm" onPress={() => {}} />
          <Button title="Supprimer" variant="destructive" size="sm" icon="trash-outline" onPress={() => {}} />
          <Button title="Petit" size="sm" onPress={() => {}} style={{ marginLeft: 'auto' }} />
        </View>
        <Card variant="emeraldPanel" panel={
          <View style={{ gap: 12 }}>
            <Button title="Créer un compte gratuit" variant="lime" trailingIcon="arrow-forward" onPress={() => {}} />
            <Button title="J’ai déjà un compte" variant="ghostLight" onPress={() => {}} />
          </View>
        } />
        <View style={[styles.row, { gap: 10 }]}>
          <IconButton icon="options-outline" accessibilityLabel="Filtres" />
          <IconButton icon="close" variant="sunken" accessibilityLabel="Fermer" />
          <IconButton icon="chevron-back" variant="plain" accessibilityLabel="Retour" />
          <IconButton icon="create-outline" variant="tonal" accessibilityLabel="Modifier" />
          <View style={{ padding: 6, backgroundColor: palette.em800, borderRadius: 30 }}>
            <IconButton icon="chatbubble-ellipses-outline" variant="light" accessibilityLabel="Retours" dot />
          </View>
          <FAB accessibilityLabel="Ajouter" />
        </View>
      </Section>

      <Section title="Champs">
        <TextField label="Adresse e-mail" placeholder="vous@etablissement.fr" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <View style={[styles.row, { gap: 12, alignItems: 'flex-start' }]}>
          <TextField containerStyle={{ flex: 1.4 }} label="Prix d’achat HT" meta="hors droits" value={buy} onChangeText={setBuy} keyboardType="decimal-pad" suffix="€" testID="field-buy" />
          <TextField containerStyle={{ flex: 1 }} label="Degré" value="40" keyboardType="decimal-pad" suffix="% vol." />
        </View>
        <TextField label="Nom du produit" value="" placeholder="Hendrick’s Gin" error="Le nom du produit est obligatoire." />
        <TextField variant="search" leftIcon="search" placeholder="Rechercher un produit…" right={<IconButton icon="scan-outline" variant="sunken" size={40} iconSize={20} accessibilityLabel="Scanner" />} />
        <TextField variant="sunken" leftIcon="search" placeholder="Porto, IPA, Lillet, cidre…" />
      </Section>

      <Section title="Steppers">
        <View style={styles.rowBetween}>
          <View>
            <Text style={[type.headline, { color: palette.ink }]}>Prix de vente</Text>
            <Text style={[type.footnote, { color: palette.text3 }]}>TTC · TVA 20 %</Text>
          </View>
          <NumberInput value={price} onChange={setPrice} step={0.1} min={0} max={200} format={(n) => formatEuro(n)} suffix="€" accessibilityLabel="Prix de vente TTC" testID="stepper-price" />
        </View>
        <NumberInput size="large" label="Degré d’alcool" value={degree} onChange={setDegree} step={0.5} min={0} max={100} decimals={1} format={formatDegree} suffix="% vol." />
      </Section>

      <Section title="Chips">
        <ChipRow
          items={[
            { key: 'all', label: 'Tous', count: 24 },
            { key: 'spi', label: 'Spiritueux', count: 9 },
            { key: 'vin', label: 'Vins', count: 6 },
            { key: 'biere', label: 'Bières', count: 5 },
            { key: 'soft', label: 'Softs & Jus', count: 4 },
          ]}
          selectedKey={cat}
          onSelect={setCat}
        />
        <ChipRow
          items={[
            { key: 'shot3', label: 'Shot 3 cl', icon: 'flask-outline', done: true },
            { key: 'verre5', label: 'Verre 5 cl', icon: 'wine-outline' },
            { key: 'verre12', label: 'Verre de vin 12 cl', icon: 'wine-outline' },
            { key: 'demi', label: 'Demi 25 cl', icon: 'beer-outline', done: true },
            { key: 'pinte', label: 'Pinte 50 cl', icon: 'beer-outline' },
          ]}
          selectedKey={service}
          onSelect={setService}
        />
        <View style={[styles.row, { gap: 8 }]}>
          <Chip label="Désactivé" disabled />
          <Chip label="Sélectionné" selected count={3} />
        </View>
      </Section>

      <Section title="Tarification" meta={`${DOSES} verres par bouteille`}>
        <Card>
          <SegmentedControl
            options={[
              { key: 'price', label: 'Prix', hint: '€' },
              { key: 'margin', label: 'Marge', hint: '%' },
              { key: 'coeff', label: 'Coeff', hint: '×' },
            ]}
            value={mode}
            onChange={setMode}
            accessibilityLabel="Mode de calcul"
          />
          <SwapFade value={mode} style={{ marginTop: 14 }}>
            <Text style={[type.stepperValue, { color: palette.ink }]}>{modeValue}</Text>
          </SwapFade>
          <Slider
            style={{ marginTop: 10 }}
            testID="slider-price"
            value={price}
            onChange={setPrice}
            onSlidingChange={setDragging}
            min={1}
            max={20}
            step={0.1}
            formatLabel={(v) => formatEuro(v, { trimZeros: true })}
            marker={{ value: objectivePrice, label: `Objectif 65 % · ${formatEuro(objectivePrice)}` }}
            zones={[{ to: (PURCHASE_HT / DOSES / 0.5) * 1.2, color: 'bad' }, { to: objectivePrice, color: 'warn' }, { color: 'good' }]}
            accessibilityLabel="Prix de vente TTC"
          />
          <Text style={[type.footnote, { color: palette.text2, marginTop: 10 }]}>
            Dès {formatEuro(objectivePrice)} TTC, ce verre dépasse 65 % de marge.
          </Text>
        </Card>
        <ResultGrid>
          <ResultTile label="Prix TTC" value={formatEuro(price)} caption="5 cl" />
          <ResultTile label="Prix HT" value={formatEuro(m.ht)} caption="HT · 5 cl" />
          <ResultTile label="Marge" value={formatPercent(m.margin)} zone={zone} highlight caption="objectif 65 %" />
          <ResultTile label="Coût/dose" value={formatEuro(m.cost)} />
          <ResultTile label="Gain/dose" value={formatEuro(m.gain)} valueColor={palette[zone === 'green' ? 'good' : zone === 'orange' ? 'warn' : 'bad']} />
          <ResultTile label="Gain total" value={formatEuro(m.gain * DOSES)} caption={`${DOSES} verres`} />
        </ResultGrid>
        <View style={styles.rowBetween}>
          <Text style={[type.footnote, { color: palette.text3 }]}>Marge live {dragging ? '(glisser)' : ''}</Text>
          <AnimatedNumber value={m.margin} instant={dragging} format={(n) => formatPercent(n)} style={[type.numM, { color: palette.ink }]} />
        </View>
      </Section>

      <Section title="Badges">
        <View style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Badge value={69} />
          <Badge value={62.3} />
          <Badge value={42.7} />
          <Badge variant="brand" icon="shield-checkmark" label="Tarifs 2026" />
          <Badge variant="brand" icon="calendar-outline" label="Compact" size="sm" />
          <Badge variant="lime" icon="sparkles" label="Gratuit" />
          <Badge variant="neutral" icon="checkmark-circle" label="Brouillon" />
          <Badge variant="count" label="24" />
        </View>
        <View style={{ backgroundColor: palette.em800, padding: 12, borderRadius: 16, flexDirection: 'row', gap: 8 }}>
          <Badge variant="pillDark" icon="trending-up" label="+7,15 € de droits" />
          <Badge variant="onEmerald" label="Sans compte" />
        </View>
      </Section>

      <Section title="Lignes">
        <Card>
          <ValueRow label="Droits d’accise" value={formatEuro(5.41)} />
          <ValueRow label="Cotisation sécu." qualifier="> 18 % vol." value={formatEuro(1.74)} />
          <ValueRow label="Total droits" value={formatEuro(7.15)} strong />
          <ValueRow label="Prix TTC" qualifier="TVA 20 %" value={formatEuro(21.78)} />
          <ValueRow label="Prix au litre HT" value={formatEuro(25.93)} last />
        </Card>
        <ListGroup>
          <ListRow icon="business-outline" title="Établissement" subtitle="Le Comptoir Démo" onPress={() => {}} />
          <ListRow icon="pricetag-outline" title="TVA par défaut" right="value" value="20 %" onPress={() => {}} />
          <ListRow icon="phone-portrait-outline" title="Retours haptiques" subtitle="Vibrations légères" switchValue={sw} onSwitchChange={setSw} />
          <ListRow icon="chatbubble-ellipses-outline" title="Aide & retours" subtitle="Signaler un problème" onPress={() => {}} />
          <ListRow icon="log-out-outline" title="Se déconnecter" destructive onPress={() => {}} />
        </ListGroup>
        <View>
          <SectionHeader variant="caps" title="Spiritueux & liqueurs" />
          <ListRow title="Spiritueux" subtitle="Whisky, vodka, gin, cognac, tequila…" right="radio" selected onPress={() => {}} />
          <ListRow title="Rhum des DOM" subtitle="Martinique, Guadeloupe, Réunion · tarif réduit" right="radio" onPress={() => {}} divider />
        </View>
        <SectionHeader title="Marge par catégorie" action="Détails" onAction={() => {}} />
        <Card>
          {[
            ['Spiritueux', 9, 79.6],
            ['Bières', 5, 74.2],
            ['Vins', 6, 67.4],
            ['Softs & Jus', 4, 61.8],
          ].map(([name, n, v], i, arr) => {
            const z = getMarginColor(v as number);
            const color = z === 'green' ? palette.good : z === 'orange' ? palette.warnSolid : palette.badSolid;
            return (
              <View key={name as string} style={[styles.meterRow, i < arr.length - 1 && styles.meterDivider]}>
                <Text style={[type.headline, { color: palette.ink, width: 118 }]} numberOfLines={1}>
                  {name} <Text style={[type.footnote, { color: palette.text3 }]}>{n}</Text>
                </Text>
                <Meter value={(v as number) / 100} color={color} marker={0.65} delay={i * 50} style={{ flex: 1 }} />
                <Text style={[type.numM, { fontSize: 17, color: z === 'orange' ? palette.warn : z === 'red' ? palette.bad : palette.good, width: 72, textAlign: 'right' }]}>
                  {formatPercent(v as number)}
                </Text>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section title="Cartes">
        <Card onPress={() => toast.info('Carte pressée')} accessibilityLabel="Calculer les droits d’alcool">
          <View style={styles.row}>
            <BrandMark size={48} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={[type.headline, { color: palette.ink }]}>Calculer les droits d’alcool</Text>
              <Text style={[type.footnote, { color: palette.text3 }]}>13 catégories · Tarifs 2026</Text>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type.title3, { color: palette.em700 }]}>›</Text>
            </View>
          </View>
        </Card>
        <Card variant="flat">
          <Text style={[type.callout, { color: palette.text2 }]}>Carte plate (imbriquée, sans ombre).</Text>
        </Card>
        <Card
          variant="emeraldPanel"
          panel={
            <View>
              <View style={styles.rowBetween}>
                <Text style={[type.callout, { color: palette.onEmerald2 }]}>Prix HT avec droits</Text>
                <Badge variant="lime" label="+7,15 € de droits" />
              </View>
              <AnimatedNumber value={18.15} format={(n) => formatNumber(n, 2)} suffix={' €'} suffixStyle={{ fontSize: 28, color: 'rgba(255,255,255,0.8)' }} style={[type.numHero, { color: '#FFFFFF', marginTop: 4 }]} />
              <CompositionBar
                surface="emerald"
                style={{ marginTop: 16 }}
                legend="labels"
                segments={[
                  { key: 'achat', value: 11, label: 'Achat' },
                  { key: 'accise', value: 5.41, label: 'Accise' },
                  { key: 'secu', value: 1.74, label: 'Sécurité sociale' },
                ]}
              />
            </View>
          }
        >
          <ValueRow label="Droits d’accise" value={formatEuro(5.41)} />
          <ValueRow label="Total droits" value={formatEuro(7.15)} strong last />
        </Card>
        <Card>
          <CompositionBar
            legend="values"
            segments={[
              { key: 'achat', value: 11, label: 'Achat HT' },
              { key: 'accise', value: 5.41, label: 'Accise' },
              { key: 'secu', value: 1.74, label: 'Sécu.' },
            ]}
          />
        </Card>
      </Section>

      <Section title="Produits" meta="appui long = actions">
        <MarginLegend counts={countByZone(DEMO_PRODUCTS)} />
        {DEMO_PRODUCTS.map((p) => (
          <ProductCard key={p.id} product={p} onPress={() => toast.info(p.name)} onLongPress={() => setActionsFor(p)} testID={`card-${p.id}`} />
        ))}
        <View style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
          <PriceTag label="Verre 12 cl" price={7} />
          <PriceTag label="Pinte 50 cl" price={7.5} />
        </View>
      </Section>

      <Section title="En-têtes">
        <Card noPadding style={{ overflow: 'hidden' }}>
          <NavBar title="Nouveau produit" onBack={() => toast.info('Retour')} trailing={<Badge variant="neutral" icon="checkmark-circle" label="Brouillon" />} />
          <Divider />
          <NavBar title="Calculateur de droits" onBack={() => {}} trailing={<Badge variant="brand" icon="shield-checkmark" label="Tarifs 2026" />} />
        </Card>
        <View style={[styles.row, { gap: 16 }]}>
          <BrandMark />
          <View style={{ backgroundColor: palette.em800, padding: 8, borderRadius: 14 }}>
            <BrandMark variant="onEmerald" />
          </View>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' }}>
            <BrandMark variant="tonal" size={44} />
          </View>
          <Avatar name="Le Comptoir Démo" />
        </View>
        <Wordmark />
      </Section>

      <Section title="États vides">
        <Card>
          <EmptyState
            surface="surface"
            marquee
            primary={{ label: 'Scanner une bouteille', icon: 'scan', onPress: () => {} }}
            secondary={[
              { label: 'Facture', icon: 'receipt-outline', onPress: () => {} },
              { label: 'À la main', icon: 'create-outline', onPress: () => {} },
            ]}
          />
        </Card>
        <Card>
          <EmptyState variant="noResults" query="Chartreuse" primary={{ label: 'Effacer la recherche', onPress: () => {} }} />
        </Card>
        <Card>
          <EmptyState variant="offline" />
        </Card>
      </Section>

      <Section title="Chargement">
        <SkeletonProductCard />
        <SkeletonProductCard />
        <View style={[styles.row, { gap: 12 }]}>
          <SkeletonStatTile style={{ flex: 1 }} />
          <SkeletonStatTile style={{ flex: 1 }} />
        </View>
        <Skeleton height={12} width="70%" />
        <Card style={{ alignItems: 'center' }}>
          <YinYangSpinner size={64} message="Chargement des produits…" submessage="Un instant" />
        </Card>
      </Section>

      <Section title="Superpositions">
        <Button title="Ouvrir la feuille « Catégorie fiscale »" variant="secondary" icon="list-outline" onPress={() => setSheet(true)} testID="open-sheet" />
        <Button title="Ouvrir l’accueil (WelcomeModal)" variant="secondary" icon="sparkles-outline" onPress={() => setWelcome(true)} testID="open-welcome" />
        <View style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Button title="Toast succès" size="sm" variant="tonal" onPress={() => toast.success('Hendrick’s Gin enregistré')} testID="toast-success" />
          <Button title="Toast erreur" size="sm" variant="tonal" onPress={() => toast.error('Connexion impossible. Réessayez.')} />
          <Button title="Toast action" size="sm" variant="tonal" onPress={() => toast.info('Produit supprimé', { action: { label: 'Annuler', onPress: () => toast.success('Suppression annulée') } })} />
        </View>
        <View style={[styles.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Button
            title="Confirmer"
            size="sm"
            variant="secondary"
            testID="confirm-dialog"
            onPress={async () => {
              const ok = await dialog.confirm({ title: 'Enregistrer comme produit ?', message: 'Le calcul « Spiritueux 70 cl » sera ajouté à vos produits.', confirmLabel: 'Enregistrer' });
              toast.info(ok ? 'Confirmé' : 'Annulé');
            }}
          />
          <Button
            title="Supprimer…"
            size="sm"
            variant="destructive"
            testID="destructive-dialog"
            onPress={() => confirm('Supprimer ce produit ?', 'Hendrick’s Gin et ses 2 services seront supprimés. Cette action est définitive.', () => toast.success('Produit supprimé'), 'Supprimer', true)}
          />
          <Button title="alert() erreur" size="sm" variant="text" onPress={() => alert('Erreur', 'Photo trop volumineuse')} />
          <Button title="alert() succès" size="sm" variant="text" onPress={() => alert('Succès', 'Paramètres mis à jour')} />
        </View>
        <ListRow title="Barre d’action collante" subtitle="Affiche StickyActionBar en bas de l’écran" switchValue={sticky} onSwitchChange={setSticky} />
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <StickyActionBar summary="2 services tarifés sur 5" summaryRight={`Coeff ${formatCoeff(m.coeff)}`} primary={{ title: 'Enregistrer', icon: 'checkmark-circle', onPress: save }} style={{ borderTopWidth: 0 }} />
        </Card>
      </Section>

      <Section title="Erreur">
        <ErrorBoundary key={crash ? 'crashed' : 'ok'} fallbackMessage="Le tableau de bord n’a pas pu s’afficher.">
          <Boom crash={crash} />
        </ErrorBoundary>
        <Button title={crash ? 'Réinitialiser' : 'Simuler une erreur'} size="sm" variant="secondary" onPress={() => setCrash((c) => !c)} testID="simulate-crash" />
      </Section>

      <Section title="Animations">
        {[0, 1, 2, 3].map((i) => (
          <FadeIn key={i} index={i}>
            <Card padding={14}>
              <Text style={[type.callout, { color: palette.text2 }]}>Élément {i + 1} · entrée décalée de {i * 40} ms</Text>
            </Card>
          </FadeIn>
        ))}
      </Section>

      <FiscalCategorySheet
        visible={sheet}
        value={fiscal}
        onSelect={(r) => {
          setFiscal(r.slug);
          toast.success(`${r.label} sélectionné`);
        }}
        onClose={() => setSheet(false)}
        testID="sheet"
      />
      <ProductActionsSheet
        product={actionsFor}
        onClose={() => setActionsFor(null)}
        onEdit={() => toast.info('Modifier')}
        onDuplicate={() => toast.info('Dupliquer')}
        onDelete={() => confirm('Supprimer ce produit ?', 'Cette action est définitive.', () => toast.success('Produit supprimé'), 'Supprimer', true)}
      />
      <WelcomeModal visible={welcome} onClose={() => setWelcome(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bleed: { marginHorizontal: -20 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46 },
  meterDivider: { borderBottomWidth: 1, borderBottomColor: palette.line },
});
