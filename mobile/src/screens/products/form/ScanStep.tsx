/**
 * « Scanner un produit » — the first step of a new product (spec §4 + BRIEF):
 * intro (tips, quota) → photo being prepared and read (emerald sweep, live
 * checklist) → what was recognised, or a calm error. Every path continues to
 * the form with the photo kept: the scan never blocks.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottleScanResult, Category } from '@margebar/shared';
import {
  Button,
  Card,
  FadeIn,
  ListGroup,
  ListRow,
  NavBar,
  Screen,
  StickyActionBar,
  SwapFade,
  ValueRow,
} from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { formatDegree, formatEuro, formatNumber, formatVolumeCl, NBSP, plural } from '../../../utils/format';
import { QUOTA_SHOWN_BELOW, type ScanQuota } from '../../../services/scan.service';
import { ScanFrame } from './ScanFrame';
import type { PickSource } from './photo';

export type ScanPhase = 'intro' | 'preparing' | 'reading' | 'result' | 'error';

export interface ScanStepProps {
  phase: ScanPhase;
  photoUri: string | null;
  /** True once the photo is resized (it will be kept on the product). */
  photoReady: boolean;
  result: BottleScanResult | null;
  error: { title: string; message: string; tone: 'bad' | 'warn'; icon?: React.ComponentProps<typeof Ionicons>['name'] } | null;
  categories: Category[];
  quota: ScanQuota | null;
  draft: { name: string; savedAt: number } | null;
  savedCalcs: number;
  onPick: (source: PickSource) => void;
  onManual: () => void;
  onContinue: () => void;
  /** « Continuer sans attendre »: the read keeps going and fills the empty fields when it lands. */
  onSkip: () => void;
  onRetake: () => void;
  onResumeDraft: () => void;
  onDiscardDraft: () => void;
  onOpenCalcs: () => void;
}

export function ScanStep(props: ScanStepProps) {
  const { phase, photoUri } = props;
  const { height: winH, width: winW } = useWindowDimensions();
  const narrow = winW < 380;
  const working = phase === 'preparing' || phase === 'reading';
  const bigFrame = Math.max(220, Math.min(380, winH - 476));
  const smallFrame = Math.max(180, Math.min(260, winH - 560));

  // One bar for every phase: its content cross-fades instead of the whole bar remounting.
  let actions: React.ReactNode;
  if (phase === 'intro') {
    actions = (
      <View style={styles.footStack}>
        <View style={styles.footRow}>
          <Button title="Choisir une image" variant="secondary" size="sm" icon={narrow ? undefined : 'images-outline'} onPress={() => props.onPick('library')} style={styles.footBtn} testID="scan-library" />
          <Button title="Saisir à la main" variant="tonal" size="sm" icon={narrow ? undefined : 'create-outline'} onPress={props.onManual} style={styles.footBtn} testID="scan-manual" />
        </View>
        <Button title="Prendre une photo" icon="camera-outline" onPress={() => props.onPick('camera')} haptic="tap" testID="scan-camera" />
      </View>
    );
  } else if (working) {
    actions = (
      <Button
        title={phase === 'reading' ? 'Continuer sans attendre' : 'Préparation de la photo…'}
        variant="tonal"
        onPress={props.onSkip}
        disabled={!props.photoReady}
        testID="scan-skip"
      />
    );
  } else if (phase === 'result') {
    actions = (
      <View style={styles.footRow}>
        <Button title="Reprendre" variant="secondary" icon="camera-reverse-outline" onPress={props.onRetake} style={{ flex: 1 }} />
        <Button title="Continuer" trailingIcon="arrow-forward" onPress={props.onContinue} style={{ flex: 1.4 }} testID="scan-continue" />
      </View>
    );
  } else {
    actions = (
      <View style={styles.footStack}>
        <Button title="Reprendre la photo" variant="secondary" size="sm" icon="camera-reverse-outline" onPress={props.onRetake} testID="scan-retake" />
        <Button
          title={photoUri ? 'Continuer sans lecture' : 'Saisir à la main'}
          trailingIcon="arrow-forward"
          onPress={photoUri ? props.onContinue : props.onManual}
          testID="scan-continue"
        />
      </View>
    );
  }
  const footer = (
    <StickyActionBar>
      <SwapFade value={working ? 'working' : phase}>{actions}</SwapFade>
    </StickyActionBar>
  );

  return (
    <Screen header={<NavBar title="Scanner un produit" />} stickyFooter={footer} testID="scan-step">
      {phase === 'intro' ? (
        <Intro {...props} frameHeight={Math.max(170, Math.min(220, winH - 640))} />
      ) : working ? (
        <FadeIn key="working" offset={8}>
          <ScanFrame uri={photoUri} status="working" height={bigFrame} style={styles.frameGap} />
          <Progress phase={phase} />
        </FadeIn>
      ) : phase === 'result' ? (
        <FadeIn key="result" offset={8}>
          <ScanFrame uri={photoUri} status="done" height={smallFrame} style={styles.frameGap} />
          <Result result={props.result} categories={props.categories} />
        </FadeIn>
      ) : (
        <FadeIn key="error" offset={8}>
          <ScanFrame uri={photoUri} status={photoUri ? (props.error?.tone === 'warn' ? 'warn' : 'error') : 'idle'} height={smallFrame} style={styles.frameGap} />
          <ErrorCard error={props.error} hasPhoto={!!photoUri} />
        </FadeIn>
      )}
    </Screen>
  );
}

// ─── Intro ─────────────────────────────────────────────────────────────────

const TIPS: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }[] = [
  { icon: 'scan-outline', title: 'De face', text: 'L’étiquette entière dans le cadre' },
  { icon: 'sunny-outline', title: 'Bonne lumière', text: 'Sans reflet ni contre-jour' },
  { icon: 'aperture-outline', title: 'Image nette', text: 'Tenez le téléphone immobile' },
];

function Intro(props: ScanStepProps & { frameHeight: number }) {
  const { quota, draft } = props;
  return (
    <View>
      <FadeIn index={0}>
        <ScanFrame height={props.frameHeight} style={styles.frameGap} />
      </FadeIn>
      <FadeIn index={1}>
        <Text style={styles.title} accessibilityRole="header">
          Photographiez l’étiquette
        </Text>
        <Text style={styles.lead}>
          Nous lisons le nom, le degré et la contenance pour pré-remplir la fiche. Vous vérifiez avant d’enregistrer.
        </Text>
      </FadeIn>

      {draft ? (
        <FadeIn index={2}>
          <Card padding={12} style={styles.draft}>
            <View style={styles.draftRow}>
              <View style={styles.draftIcon}>
                <Ionicons name="document-text-outline" size={20} color={palette.em700} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.draftTitle}>Brouillon en cours</Text>
                <Text style={styles.draftMeta} numberOfLines={1}>
                  {draft.name ? draft.name : 'Produit sans nom'} · {sinceLabel(draft.savedAt)}
                </Text>
                <View style={styles.draftActions}>
                  <Button title="Reprendre" variant="tonal" size="sm" icon="arrow-undo-outline" onPress={props.onResumeDraft} testID="draft-resume" />
                  <Button
                    title="Supprimer"
                    variant="text"
                    size="sm"
                    icon={<Ionicons name="trash-outline" size={17} color={palette.bad} />}
                    textStyle={{ color: palette.bad }}
                    onPress={props.onDiscardDraft}
                    accessibilityLabel="Supprimer le brouillon"
                    testID="draft-discard"
                  />
                </View>
              </View>
            </View>
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn index={draft ? 3 : 2}>
        <ListGroup style={styles.tips}>
          {TIPS.map((t) => (
            <ListRow key={t.title} icon={t.icon} title={t.title} subtitle={t.text} right="none" />
          ))}
        </ListGroup>
      </FadeIn>

      {props.savedCalcs > 0 ? (
        <FadeIn index={draft ? 4 : 3}>
          <Card padding={4} style={styles.calcs}>
            <ListRow
              icon="calculator-outline"
              title="Depuis le calculateur de droits"
              subtitle={`${props.savedCalcs}${NBSP}calcul${props.savedCalcs > 1 ? 's' : ''} enregistré${props.savedCalcs > 1 ? 's' : ''}`}
              onPress={props.onOpenCalcs}
            />
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn index={draft ? 5 : 4}>
        <View style={styles.quota}>
          <Ionicons name="shield-checkmark-outline" size={16} color={palette.text3} />
          <Text style={styles.quotaText}>
            {/* The count only matters near the limit: « 99 999 restantes » read like a technical value. */}
            {quota && quota.remaining < QUOTA_SHOWN_BELOW
              ? quota.remaining > 0
                ? `Lecture gratuite · ${plural(quota.remaining, 'lecture restante', 'lectures restantes')} aujourd’hui`
                : 'Limite de lectures du jour atteinte · la photo reste utilisable'
              : 'Lecture gratuite · la photo reste sur votre fiche'}
          </Text>
        </View>
      </FadeIn>
    </View>
  );
}

function sinceLabel(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min}${NBSP}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h}${NBSP}h`;
  const d = Math.round(h / 24);
  return d <= 1 ? 'hier' : `il y a ${d}${NBSP}jours`;
}

// ─── Working ───────────────────────────────────────────────────────────────

function Progress({ phase }: { phase: ScanPhase }) {
  const [slow, setSlow] = useState(0);
  useEffect(() => {
    setSlow(0);
    if (phase !== 'reading') return;
    const a = setTimeout(() => setSlow(1), 6000);
    const b = setTimeout(() => setSlow(2), 16000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [phase]);

  const steps: { label: string; state: 'done' | 'active' | 'todo' }[] = [
    { label: 'Photo préparée', state: phase === 'preparing' ? 'active' : 'done' },
    // Two honest steps: the result screen that follows IS the pre-filled form preview.
    { label: 'Lecture de l’étiquette', state: phase === 'reading' ? 'active' : 'todo' },
  ];
  const headline = phase === 'preparing' ? 'Préparation de la photo…' : slow === 0 ? 'Lecture de l’étiquette…' : slow === 1 ? 'Encore un instant…' : 'La lecture prend plus de temps que prévu…';

  return (
    <View accessibilityLiveRegion="polite">
      <Text style={styles.title}>{headline}</Text>
      <Text style={styles.lead}>
        {phase === 'preparing'
          ? 'La photo est réduite avant l’envoi : rapide et léger.'
          : 'Vous pourrez tout vérifier et corriger avant d’enregistrer.'}
      </Text>
      <Card padding={4} style={styles.tips}>
        {steps.map((s, i) => (
          <View key={s.label} style={[styles.step, i < steps.length - 1 && styles.tipDivider]}>
            <View style={[styles.stepDot, s.state === 'done' && styles.stepDone, s.state === 'todo' && styles.stepTodo]}>
              {s.state === 'done' ? (
                <Ionicons name="checkmark" size={14} color={palette.onEmerald} />
              ) : s.state === 'active' ? (
                <ActivityIndicator size="small" color={palette.em700} />
              ) : null}
            </View>
            <Text style={[styles.stepLabel, s.state === 'todo' && { color: palette.text3 }]}>{s.label}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

// ─── Result ────────────────────────────────────────────────────────────────

function Result({ result, categories }: { result: BottleScanResult | null; categories: Category[] }) {
  if (!result) return null;
  const cat = categories.find((c) => c.slug === result.category);
  const missing = 'À compléter';
  const rows: { label: string; value: string | null }[] = [
    { label: 'Nom', value: result.name?.trim() || null },
    { label: 'Catégorie', value: cat?.name ?? null },
    { label: 'Contenance', value: result.containerVolumeCl ? formatVolumeCl(result.containerVolumeCl) : null },
    { label: 'Degré', value: result.alcoholDegree !== null && result.alcoholDegree !== undefined ? formatDegree(result.alcoholDegree) : null },
  ];
  if (result.estimatedPriceHT) rows.push({ label: 'Prix d’achat HT', value: formatEuro(result.estimatedPriceHT) });
  const found = rows.filter((r) => r.value).length;
  return (
    <View>
      <Text style={styles.title} accessibilityRole="header">
        Étiquette lue
      </Text>
      <Text style={styles.lead}>
        {found >= rows.length ? 'Tout a été reconnu. Vérifiez, puis complétez les prix.' : 'Vérifiez ces informations et complétez ce qui manque dans la fiche.'}
      </Text>
      <Card style={styles.tips}>
        {rows.map((r, i) => (
          <ValueRow
            key={r.label}
            label={r.label}
            value={r.value ?? missing}
            valueColor={r.value ? palette.ink : palette.text3}
            last={i === rows.length - 1}
          />
        ))}
      </Card>
    </View>
  );
}

// ─── Error ─────────────────────────────────────────────────────────────────

function ErrorCard({ error, hasPhoto }: { error: ScanStepProps['error']; hasPhoto: boolean }) {
  if (!error) return null;
  const tone = error.tone === 'bad' ? { bg: palette.badBg, fg: palette.bad } : { bg: palette.warnBg, fg: palette.warn };
  return (
    <View accessibilityLiveRegion="polite">
      <Card style={styles.errorCard}>
        <View style={[styles.errorIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={error.icon ?? (error.tone === 'bad' ? 'alert-circle-outline' : 'time-outline')} size={24} color={tone.fg} />
        </View>
        <Text style={styles.errorTitle} accessibilityRole="header">
          {error.title}
        </Text>
        <Text style={styles.errorText}>{error.message}</Text>
        <View style={styles.errorNote}>
          <Ionicons name={hasPhoto ? 'image-outline' : 'create-outline'} size={16} color={palette.em700} />
          <Text style={styles.errorNoteText}>
            {hasPhoto ? 'La photo est conservée sur la fiche : rien n’est perdu.' : 'Vous pouvez remplir la fiche à la main.'}
          </Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  frameGap: { marginTop: 8 },
  title: { ...type.title2, color: palette.ink, marginTop: 20 },
  lead: { ...type.callout, color: palette.text2, marginTop: 6 },
  footRow: { flexDirection: 'row', gap: 10 },
  footStack: { gap: 10 },
  footBtn: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  tips: { marginTop: 16 },
  tipDivider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  calcs: { marginTop: 12 },
  quota: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  quotaText: { ...type.footnote, color: palette.text3, flexShrink: 1 },
  draft: { marginTop: 16 },
  draftRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  draftActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  draftIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  draftTitle: { ...type.headline, color: palette.ink },
  draftMeta: { ...type.footnote, color: palette.text3, marginTop: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: palette.em700 },
  stepTodo: { borderWidth: 2, borderColor: palette.lineStrong },
  stepLabel: { ...type.calloutStrong, color: palette.ink },
  errorCard: { marginTop: 16, padding: 20 },
  errorIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  errorTitle: { ...type.title3, color: palette.ink },
  errorText: { ...type.callout, color: palette.text2, marginTop: 6 },
  errorNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.em50,
  },
  errorNoteText: { ...type.footnoteStrong, color: palette.em800, flexShrink: 1 },
});
