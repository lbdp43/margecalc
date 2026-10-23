/**
 * Lot 2 (UX audit n° 10) — what an invoice line does to the user's catalogue,
 * at the foot of its review card:
 *
 *   ↻  Mettre à jour « Côtes du Rhône rouge »                       Changer
 *      Achat 6,80 → 4,85 € (−28,7 %)
 *
 *   ≈  Ressemble à « Côtes du Rhône rouge » (75 cl)
 *      Mettre à jour ce produit ?   Achat 6,80 → 4,85 € (−28,7 %)
 *      [ Lier ] [ Créer un nouveau ]
 *      Choisir un autre produit
 *
 *   +  Nouveau produit                                     Lier à un produit
 *
 * A look-alike name is never linked silently: « Lier » sends `productId`
 * (remembered by the backend for this supplier), « Créer un nouveau » sends
 * `createNew`. A sibling of the card's pressables (never nested in them).
 *
 * Review logic (each proposed change is kept or refused line by line, can be
 * changed afterwards, and the undecided ones are settled in one go at
 * « Importer ») adapted from Kokonut UI « AI Diff Review » by @kokonutui
 * (MIT, © 2025 kokonutUI, kokonutui.com): the logic only, rebuilt with the
 * D1 kit.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, PressableScale } from '../../components/ui';
import { palette, radius, type } from '../../theme';
import { NBSP, formatEuro, formatPercent, formatVolumeCl } from '../../utils/format';
import { changePercent, containerDiffers, containerOf, priceDecimals, samePurchase, type InvoiceLine, type LineTarget, type PricingContext } from './model';

export interface MatchBlockProps {
  line: InvoiceLine;
  target: LineTarget;
  /** The matching has not answered for this line yet: a neutral « Recherche dans vos produits… » row. */
  pending?: boolean;
  ctx: PricingContext;
  supplier: string;
  disabled?: boolean;
  /** « Lier »: confirm the look-alike product. */
  onLink: (lineId: string) => void;
  /** « Créer un nouveau »: refuse it. */
  onCreateNew: (lineId: string) => void;
  /** « Choisir un autre produit » / « Changer » / « Lier à un produit »: the product sheet. */
  onChoose: (lineId: string) => void;
}

/** Score from which a candidate (not linked automatically) is named under « Nouveau produit ». */
const CLOSE_SCORE = 0.7;

const quote = (s: string) => `«${NBSP}${s}${NBSP}»`;

/** « Achat 6,80 → 4,85 € (−28,7 %) » · « Achat 17,90 € · inchangé » · null when the price before is unknown. */
export function PurchaseChange({ before, after, style }: { before: number | null | undefined; after: number | null | undefined; style?: any }) {
  if (typeof before !== 'number' || typeof after !== 'number' || !(after > 0)) return null;
  const dec = Math.max(priceDecimals(before), priceDecimals(after));
  if (samePurchase(before, after)) {
    return <Text style={[styles.detail, style]}>Achat {formatEuro(after, { decimals: dec })} · inchangé</Text>;
  }
  const pct = changePercent(before, after);
  const up = after > before;
  return (
    <Text
      style={[styles.detail, style]}
      accessibilityLabel={`Prix d’achat ${formatEuro(before, { decimals: dec })}, puis ${formatEuro(after, { decimals: dec })}`}
    >
      Achat {formatEuro(before, { decimals: dec, bare: true })} → {formatEuro(after, { decimals: dec })}
      {pct !== null ? (
        <Text style={[styles.detailStrong, { color: up ? palette.warn : palette.good }]}>{` (${formatPercent(pct, 1, { sign: true })})`}</Text>
      ) : null}
    </Text>
  );
}

function TextAction({
  label,
  onPress,
  disabled,
  testID,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: any;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo="chip"
      haptic="select"
      style={[styles.textAction, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    >
      <Text style={[styles.textActionLabel, disabled && { color: palette.text3 }]}>{label}</Text>
    </PressableScale>
  );
}

function Tile({ icon, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; tone: 'brand' | 'warn' | 'neutral' }) {
  const bg = tone === 'warn' ? palette.surface : tone === 'brand' ? palette.em50 : palette.surface2;
  const fg = tone === 'warn' ? palette.warn : tone === 'brand' ? palette.em700 : palette.text2;
  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} />
    </View>
  );
}

export function MatchBlock({ line, target, pending, ctx, supplier, disabled, onLink, onCreateNew, onChoose }: MatchBlockProps) {
  const pos = line.position;
  const remembered = supplier.trim() ? `retenu pour ${supplier.trim()}` : null;

  if (pending) {
    // Calm and static (no spinner): the answer replaces it in a moment.
    return (
      <View style={styles.block} testID={`invoice-match-${pos}`} accessibilityLiveRegion="polite">
        <View style={[styles.row, styles.rowCenter]}>
          <Tile icon="search-outline" tone="neutral" />
          <Text style={[styles.title, styles.pendingText]} testID={`invoice-match-pending-${pos}`}>
            Recherche dans vos produits…
          </Text>
        </View>
      </View>
    );
  }

  if (target.kind === 'decide') {
    const otherSize = containerDiffers(line, target.containerVolumeCl, ctx);
    return (
      <View style={[styles.block, styles.decide]} testID={`invoice-match-${pos}`} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <Tile icon="git-compare-outline" tone="warn" />
          <View style={styles.texts}>
            <Text style={styles.title}>
              Ressemble à <Text style={styles.titleStrong}>{quote(target.name)}</Text>
              {target.containerVolumeCl > 0 ? <Text style={styles.titleMeta}>{` (${formatVolumeCl(target.containerVolumeCl)})`}</Text> : null}
            </Text>
            <Text style={styles.question}>Mettre à jour ce produit ?</Text>
            <PurchaseChange before={target.previous?.purchasePriceHT} after={line.purchasePriceHT} />
            {otherSize ? (
              <Text style={styles.warnText}>
                Contenance différente : {formatVolumeCl(containerOf(line, ctx))} sur la facture, {formatVolumeCl(target.containerVolumeCl)} pour ce produit.
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.choices}>
          <Button
            title="Lier"
            icon="link-outline"
            size="sm"
            variant="primary"
            onPress={() => onLink(line.id)}
            disabled={disabled}
            style={[styles.choice, styles.choiceLink]}
            accessibilityLabel={`Lier à ${target.name} : mettre à jour son prix d’achat`}
            testID={`invoice-match-link-${pos}`}
          />
          <Button
            title="Créer un nouveau"
            size="sm"
            variant="secondary"
            onPress={() => onCreateNew(line.id)}
            disabled={disabled}
            style={[styles.choice, styles.choiceCreate]}
            accessibilityLabel={`Créer un nouveau produit ${line.name.trim()}`}
            testID={`invoice-match-create-${pos}`}
          />
        </View>
        <TextAction
          label="Choisir un autre produit"
          onPress={() => onChoose(line.id)}
          disabled={disabled}
          style={styles.chooseOther}
          testID={`invoice-match-choose-${pos}`}
        />
      </View>
    );
  }

  if (target.kind === 'update') {
    const otherSize = containerDiffers(line, target.containerVolumeCl, ctx);
    const caption =
      typeof target.viaLine === 'number'
        ? `Comme la ligne${NBSP}${target.viaLine + 1}`
        : target.reason === 'alias'
          ? remembered
            ? `Lien ${remembered}`
            : 'Lien retenu'
          : target.explicit
            ? remembered
              ? `Votre choix · ${remembered}`
              : 'Votre choix · ajoutez le fournisseur pour le retenir'
            : null;
    return (
      <View style={styles.block} testID={`invoice-match-${pos}`}>
        <View style={styles.row}>
          <Tile icon="sync-outline" tone="brand" />
          <View style={styles.texts}>
            <Text style={styles.title}>
              Mettre à jour <Text style={styles.titleStrong}>{quote(target.name)}</Text>
            </Text>
            <PurchaseChange before={target.previous?.purchasePriceHT} after={line.purchasePriceHT} />
            {caption ? <Text style={styles.caption}>{caption}</Text> : null}
            {otherSize ? (
              <Text style={styles.warnText}>
                Contenance différente : {formatVolumeCl(containerOf(line, ctx))} sur la facture, {formatVolumeCl(target.containerVolumeCl)} pour ce produit.
              </Text>
            ) : null}
          </View>
          <TextAction
            label="Changer"
            onPress={() => onChoose(line.id)}
            disabled={disabled}
            accessibilityLabel={`Changer le produit à mettre à jour pour ${line.name.trim() || 'cette ligne'}`}
            testID={`invoice-match-choose-${pos}`}
          />
        </View>
      </View>
    );
  }

  if (target.kind === 'sameAs') {
    return (
      <View style={styles.block} testID={`invoice-match-${pos}`}>
        <View style={styles.row}>
          <Tile icon="copy-outline" tone="neutral" />
          <View style={styles.texts}>
            <Text style={styles.title}>Même produit que la ligne {target.lineIndex + 1}</Text>
            <Text style={styles.caption}>{`Créé par la ligne${NBSP}${target.lineIndex + 1}, puis mis à jour avec ce prix d’achat`}</Text>
          </View>
        </View>
      </View>
    );
  }

  // create
  const n = target.suggestions.length;
  // A close look-alike is worth a word; a weak candidate (« Leffe » for « Blonde des Plantes ») is not.
  const close = target.suggestions.find((x) => x.score >= CLOSE_SCORE) ?? null;
  return (
    <View style={styles.block} testID={`invoice-match-${pos}`}>
      <View style={styles.row}>
        <Tile icon="add" tone="brand" />
        <View style={styles.texts}>
          <Text style={styles.title}>Nouveau produit</Text>
          {target.forced ? (
            <Text style={styles.caption}>{n ? `Pas lié à ${quote(target.suggestions[0].name)}` : 'Votre choix'}</Text>
          ) : close ? (
            <Text style={styles.caption}>Proche : {quote(close.name)}</Text>
          ) : null}
        </View>
        <TextAction
          label={target.forced ? 'Changer' : 'Lier à un produit'}
          onPress={() => onChoose(line.id)}
          disabled={disabled}
          accessibilityLabel={`Lier ${line.name.trim() || 'cette ligne'} à un produit existant`}
          testID={`invoice-match-choose-${pos}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  decide: {
    borderTopWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 4,
    borderRadius: radius.sm,
    backgroundColor: palette.warnBg,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowCenter: { alignItems: 'center' },
  pendingText: { color: palette.text2, flex: 1 },
  tile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, paddingTop: 1 },
  title: { ...type.callout, color: palette.ink },
  titleStrong: { ...type.calloutStrong, color: palette.ink },
  titleMeta: { ...type.callout, color: palette.text2 },
  question: { ...type.calloutStrong, color: palette.warn, marginTop: 1 },
  detail: { ...type.footnote, color: palette.text2, marginTop: 2 },
  detailStrong: { ...type.footnoteStrong },
  caption: { ...type.footnote, color: palette.text3, marginTop: 2 },
  warnText: { ...type.footnoteStrong, color: palette.warn, marginTop: 4 },
  choices: { flexDirection: 'row', gap: 8, marginTop: 12 },
  choice: { minWidth: 0, paddingHorizontal: 8 },
  // « Créer un nouveau » is the longer label: it gets the wider half (fits 360 px phones).
  choiceLink: { flex: 0.8 },
  choiceCreate: { flex: 1.2 },
  textAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, marginVertical: -6, marginRight: -6, alignSelf: 'flex-start' },
  textActionLabel: { ...type.calloutStrong, color: palette.em700 },
  chooseOther: { marginVertical: 2, marginRight: 0, marginLeft: -6 },
});
