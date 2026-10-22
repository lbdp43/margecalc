/**
 * Landing sections (mockup shot-1 + BRIEF graft 9):
 *   <LandingHeroContent />   inside <HeroHeader>: wordmark + « Gratuit », audience pill,
 *                            two-line headline, lead, lime + ghost CTAs, reassurance
 *   <ProofRow />             the three proof points, right under the teaser (13 · 2026 · 0)
 *   <FeatureSection />       what the app does, as a 2 × 2 grid of tiles
 *   <ClosingCard />          second chance to sign up after the scroll
 *   <LandingFooter />        « Une application de La Brasserie des Plantes », links, version
 *
 * The hero stays at the mockup's height (no proof row inside it), so the
 * teaser's worked example reads above the fold on a 390 × 844 phone.
 */
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BrandMark, Button, Card, FadeIn, SectionHeader, Wordmark } from '../../../components/ui';
import type { IconName } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { useSystemParamsStore } from '../../../store/systemParams.store';
import appConfig from '../../../../app.json';
import { BREWERY_URL, openExternal, writeToUs } from './contact';

/** « 3.14.0 » → « 3.14 » (same as Réglages › À propos). */
const APP_VERSION = String((appConfig as any)?.expo?.version ?? '').replace(/\.0$/, '');

// ─── Hero ──────────────────────────────────────────────────────────────────
export interface LandingHeroContentProps {
  onRegister: () => void;
  onLogin: () => void;
}

export function LandingHeroContent({ onRegister, onLogin }: LandingHeroContentProps) {
  const { width } = useWindowDimensions();
  // Keeps the headline on two lines down to 320 px screens.
  const h1Size = width < 360 ? styles.h1Small : width < 390 ? styles.h1Medium : null;

  return (
    <>
      <FadeIn index={0} style={styles.brandRow}>
        <Wordmark tone="onEmerald" style={styles.wordmark} />
        <Badge variant="lime" icon="sparkles" label="Gratuit" />
      </FadeIn>

      <FadeIn index={1} style={styles.pill}>
        <View style={styles.pip}>
          <Ionicons name="checkmark" size={12} color={palette.em900} />
        </View>
        <Text style={styles.pillText} numberOfLines={1}>
          Pour les bars, restaurants et caves
        </Text>
      </FadeIn>

      <FadeIn index={2}>
        <Text style={[styles.h1, h1Size]} accessibilityRole="header">
          Marges et droits,{'\n'}
          <Text style={styles.h1Accent}>au centime près.</Text>
        </Text>
        <Text style={styles.lead}>
          Prix de vente, marges et droits d’accise de chaque boisson, calculés en quelques secondes depuis votre téléphone.
        </Text>
      </FadeIn>

      <FadeIn index={3} style={styles.ctas}>
        <Button title="Créer un compte gratuit" variant="lime" trailingIcon="arrow-forward" onPress={onRegister} fullWidth testID="landing-register" />
        <Button title="J’ai déjà un compte" variant="ghostLight" onPress={onLogin} fullWidth testID="landing-login" />
        <View style={styles.reassure} accessible accessibilityLabel="Sans engagement, sans carte bancaire">
          <Ionicons name="checkmark-circle" size={16} color={palette.em300} />
          <Text style={styles.reassureText}>Sans engagement · sans carte bancaire</Text>
        </View>
      </FadeIn>
    </>
  );
}

// ─── Proof points (graft 9) ────────────────────────────────────────────────
/**
 * Three stats of the same shape (value, then a two-line label), so the
 * columns always balance. Only claims that are true: the official
 * categories, the customs barème of the year, and no resale of data.
 */
export function ProofRow({ categoryCount }: { categoryCount: number }) {
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const proofs: Array<{ value: string; label: string; spoken: string }> = [
    { value: String(categoryCount), label: 'catégories\nfiscales', spoken: `${categoryCount} catégories fiscales` },
    { value: String(year), label: 'barème\nofficiel', spoken: `Barème officiel des douanes ${year}` },
    { value: '0', label: 'donnée\nrevendue', spoken: 'Aucune donnée revendue' },
  ];
  return (
    <View style={styles.proofs} testID="landing-proofs">
      {proofs.map((p, i) => (
        <React.Fragment key={p.spoken}>
          {i > 0 ? <View style={styles.proofRule} /> : null}
          <View style={styles.proof} accessible accessibilityLabel={p.spoken}>
            <Text style={styles.proofValue}>{p.value}</Text>
            <Text style={styles.proofLabel} numberOfLines={2}>
              {p.label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Features ──────────────────────────────────────────────────────────────
const FEATURES: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: 'wine-outline', title: 'Par service', text: 'Verre, shot, pinte : prix, marge et coefficient.' },
  { icon: 'scan-outline', title: 'Scan gratuit', text: 'L’étiquette lue remplit nom, contenance et degré.' },
  { icon: 'receipt-outline', title: 'Factures', text: 'Une photo de facture crée vos produits d’un coup.' },
  { icon: 'cloud-offline-outline', title: 'Hors ligne', text: 'Vos marges restent consultables sans réseau.' },
];

export function FeatureSection() {
  const rows = [FEATURES.slice(0, 2), FEATURES.slice(2, 4)];
  return (
    <View>
      <SectionHeader title="Tout pour fixer vos prix" style={styles.sectionHeader} />
      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((f) => (
              <Card key={f.title} padding={14} style={styles.tile} accessibilityLabel={`${f.title}. ${f.text}`}>
                <View style={styles.tileIcon}>
                  <Ionicons name={f.icon} size={22} color={palette.em700} />
                </View>
                <Text style={styles.tileTitle} numberOfLines={1}>
                  {f.title}
                </Text>
                <Text style={styles.tileText}>{f.text}</Text>
              </Card>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Closing card ──────────────────────────────────────────────────────────
export function ClosingCard({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  return (
    <Card style={styles.closing}>
      <Text style={styles.closingTitle} accessibilityRole="header">
        Prêt à calculer vos marges ?
      </Text>
      <Text style={styles.closingText}>Votre compte est prêt en une minute. Gratuit, sans engagement.</Text>
      <Button title="Créer un compte gratuit" trailingIcon="arrow-forward" onPress={onRegister} fullWidth style={styles.closingBtn} testID="landing-register-bottom" />
      <Button title="J’ai déjà un compte" variant="text" onPress={onLogin} fullWidth />
    </Card>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────
export function LandingFooter() {
  return (
    <View style={styles.footer}>
      <BrandMark size={32} />
      <Text style={styles.footerText}>Une application de La Brasserie des Plantes</Text>
      {/* Real 44 pt targets, on their own row (not inline links). */}
      <View style={styles.footerLinks}>
        <Button
          title="Le site de la brasserie"
          variant="text"
          size="sm"
          onPress={() => openExternal(BREWERY_URL)}
          accessibilityLabel="Le site de La Brasserie des Plantes"
          testID="landing-footer-site"
        />
        <Button title="Nous écrire" variant="text" size="sm" onPress={() => writeToUs()} testID="landing-footer-mail" />
      </View>
      {APP_VERSION ? <Text style={styles.footerMeta}>{`Version ${APP_VERSION}`}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  wordmark: { flex: 1, minWidth: 0 },

  pill: {
    marginTop: 24,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    height: 32,
    paddingLeft: 7,
    paddingRight: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pip: { width: 18, height: 18, borderRadius: 9, backgroundColor: palette.em300, alignItems: 'center', justifyContent: 'center' },
  pillText: { ...type.footnoteStrong, color: palette.onEmerald, flexShrink: 1 },

  h1: { ...type.display, fontSize: 36, lineHeight: 42, letterSpacing: -1.2, color: palette.onEmerald, marginTop: 16 },
  h1Medium: { fontSize: 33, lineHeight: 39, letterSpacing: -1.1 },
  h1Small: { fontSize: 29, lineHeight: 35, letterSpacing: -0.9 },
  h1Accent: { color: palette.lime },
  lead: { ...type.body, color: palette.onEmerald2, marginTop: 12, maxWidth: 360 },

  ctas: { marginTop: 26, gap: 12 },
  reassure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  // Full white: 13 px on the lighter end of the hero gradient needs it for 4.5:1.
  reassureText: { ...type.footnoteStrong, color: palette.onEmerald },

  proofs: { flexDirection: 'row', alignItems: 'stretch', marginTop: 20, paddingHorizontal: 4 },
  proof: { flex: 1, minWidth: 0, alignItems: 'center' },
  proofRule: { width: 1, marginVertical: 4, backgroundColor: palette.line },
  proofValue: { ...type.numM, color: palette.em700 },
  proofLabel: { ...type.footnote, color: palette.text2, textAlign: 'center', marginTop: 2 },

  sectionHeader: { marginTop: 28, marginBottom: 10 },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  tile: { flex: 1, minWidth: 0 },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.icon,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { ...type.headline, color: palette.ink, marginTop: 12 },
  tileText: { ...type.footnote, color: palette.text2, marginTop: 4 },

  closing: { marginTop: 24 },
  closingTitle: { ...type.title3, color: palette.ink },
  closingText: { ...type.callout, color: palette.text2, marginTop: 4 },
  closingBtn: { marginTop: 16, marginBottom: 4 },

  footer: { alignItems: 'center', marginTop: 32 },
  footerText: { ...type.footnote, color: palette.text2, textAlign: 'center', marginTop: 12 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 4, marginTop: 4 },
  footerMeta: { ...type.footnote, color: palette.text3, textAlign: 'center', marginTop: 2 },
});
