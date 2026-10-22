/**
 * Landing sections (mockup shot-1 + BRIEF graft 9):
 *   <LandingHeroContent />   inside <HeroHeader>: wordmark + « Gratuit », audience pill,
 *                            two-line headline, lead, lime + ghost CTAs, reassurance, 3 proof points
 *   <FeatureSection />       what the app does, as a ListGroup
 *   <ClosingCard />          second chance to sign up after the scroll
 *   <LandingFooter />        « Une application de La Brasserie des Plantes » · version
 */
import React from 'react';
import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge, BrandMark, Button, Card, FadeIn, ListGroup, ListRow, SectionHeader, Wordmark } from '../../../components/ui';
import type { IconName } from '../../../components/ui';
import { fontFamily, palette, type } from '../../../theme';
import { formatPercent, plural } from '../../../utils/format';
import appConfig from '../../../../app.json';

const BREWERY_URL = 'https://labrasseriedesplantes.fr/';
const CONTACT_EMAIL = 'labrasseriedesplantes@gmail.com';
/** « 3.14.0 » → « 3.14 » (same as Réglages › À propos). */
const APP_VERSION = String((appConfig as any)?.expo?.version ?? '').replace(/\.0$/, '');

function open(url: string) {
  Linking.openURL(url).catch(() => {});
}

// ─── Hero ──────────────────────────────────────────────────────────────────
export interface LandingHeroContentProps {
  onRegister: () => void;
  onLogin: () => void;
  /** Number of official fiscal categories (13). */
  categoryCount: number;
}

export function LandingHeroContent({ onRegister, onLogin, categoryCount }: LandingHeroContentProps) {
  const { width } = useWindowDimensions();
  // Keeps the headline on two lines down to 320 px screens.
  const h1Size = width < 360 ? styles.h1Small : width < 390 ? styles.h1Medium : null;

  const proofs: Array<{ icon: IconName; label: string }> = [
    { icon: 'layers-outline', label: plural(categoryCount, 'catégorie fiscale', 'catégories fiscales') },
    { icon: 'shield-checkmark-outline', label: 'Tarifs officiels' },
    { icon: 'lock-closed-outline', label: `${formatPercent(100, 0)} privé` },
  ];

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

      <FadeIn index={4} style={styles.proofs}>
        {proofs.map((p, i) => (
          <React.Fragment key={p.label}>
            {i > 0 ? <View style={styles.proofRule} /> : null}
            <View style={styles.proof} accessible accessibilityLabel={p.label}>
              <Ionicons name={p.icon} size={20} color={palette.em300} />
              <Text style={styles.proofText}>{p.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </FadeIn>
    </>
  );
}

// ─── Features ──────────────────────────────────────────────────────────────
const FEATURES: Array<{ icon: IconName; title: string; text: string }> = [
  {
    icon: 'wine-outline',
    title: 'Marges par service',
    text: 'Verre, shot, demi ou bouteille : le prix, la marge et le coefficient de chaque service, en direct.',
  },
  {
    icon: 'scan-outline',
    title: 'Scan de bouteille gratuit',
    text: 'Photographiez l’étiquette : la lecture automatique (OCR) remplit le nom, la contenance et le degré.',
  },
  {
    icon: 'receipt-outline',
    title: 'Import de factures',
    text: 'Une facture fournisseur photographiée devient une liste de produits, avec leurs prix d’achat.',
  },
  {
    icon: 'cloud-offline-outline',
    title: 'Fonctionne hors ligne',
    text: 'Vos produits et vos marges restent consultables sans réseau, même au fond de la cave.',
  },
];

export function FeatureSection() {
  return (
    <View>
      <SectionHeader title="Tout pour fixer vos prix" style={styles.sectionHeader} />
      <ListGroup>
        {FEATURES.map((f) => (
          <ListRow key={f.title} icon={f.icon} title={f.title} subtitle={f.text} subtitleLines={3} right="none" accessibilityLabel={`${f.title}. ${f.text}`} />
        ))}
      </ListGroup>
    </View>
  );
}

// ─── Closing card ──────────────────────────────────────────────────────────
export function ClosingCard({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  return (
    <Card style={styles.closing}>
      <Text style={styles.closingTitle} accessibilityRole="header">
        Prêt à calculer vos marges ?
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
      <Text style={styles.footerText}>
        Une application de{' '}
        <Text style={styles.footerLink} accessibilityRole="link" onPress={() => open(BREWERY_URL)}>
          La Brasserie des Plantes
        </Text>
      </Text>
      <Text style={styles.footerMeta}>
        {APP_VERSION ? `Version ${APP_VERSION} · ` : ''}
        <Text style={styles.footerLink} accessibilityRole="link" onPress={() => open(`mailto:${CONTACT_EMAIL}`)}>
          Nous écrire
        </Text>
      </Text>
    </View>
  );
}

const ON_LINE = 'rgba(255,255,255,0.14)';

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  wordmark: { flex: 1, minWidth: 0 },

  pill: {
    marginTop: 28,
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
  reassureText: { ...type.footnoteStrong, color: palette.onEmerald2 },

  proofs: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: ON_LINE,
  },
  proof: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  proofRule: { width: 1, backgroundColor: ON_LINE },
  proofText: { ...type.footnoteStrong, color: palette.onEmerald, textAlign: 'center' },

  sectionHeader: { marginTop: 28, marginBottom: 10 },

  closing: { marginTop: 24 },
  closingTitle: { ...type.title3, color: palette.ink },
  closingText: { ...type.callout, color: palette.text2, marginTop: 4 },
  closingBtn: { marginTop: 16, marginBottom: 4 },

  footer: { alignItems: 'center', gap: 6, marginTop: 32 },
  footerText: { ...type.footnote, color: palette.text3, textAlign: 'center', marginTop: 6 },
  footerMeta: { ...type.footnote, color: palette.text3, textAlign: 'center' },
  footerLink: { fontFamily: fontFamily.semibold, color: palette.em700 },
});
