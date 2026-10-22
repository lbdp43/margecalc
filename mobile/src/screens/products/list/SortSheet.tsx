/**
 * Sort of « Mes produits »: a quiet trigger row (« Récemment modifiés ⌄ »,
 * mockup D1 §3) and the small sheet with the four orders (radio rows).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet, Icon, ListRow, PressableScale } from '../../../components/ui';
import { palette, type } from '../../../theme';
import { SORT_OPTIONS, SortKey } from './listModel';

export function sortLabel(key: SortKey): string {
  return SORT_OPTIONS.find((o) => o.key === key)?.label ?? SORT_OPTIONS[0].label;
}

export function SortTrigger({ value, onPress, right }: { value: SortKey; onPress: () => void; right?: React.ReactNode }) {
  const label = sortLabel(value);
  return (
    <View style={styles.row}>
      <PressableScale
        onPress={onPress}
        scaleTo="chip"
        haptic="select"
        accessibilityRole="button"
        accessibilityLabel={`Trier : ${label}`}
        accessibilityHint="Ouvre les options de tri"
        style={styles.trigger}
        hitSlop={4}
      >
        <Icon name="swap-vertical" size={16} color={palette.em700} />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Icon name="chevron-down" size={15} color={palette.text3} />
      </PressableScale>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export function SortSheet({ visible, value, onSelect, onClose }: { visible: boolean; value: SortKey; onSelect: (k: SortKey) => void; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Trier les produits" contentPadding={8}>
      {SORT_OPTIONS.map((o) => (
        <ListRow
          key={o.key}
          icon={o.icon}
          iconTone={o.key === value ? 'brand' : 'neutral'}
          title={o.label}
          subtitle={o.hint}
          right="radio"
          selected={o.key === value}
          onPress={() => {
            onSelect(o.key);
            setTimeout(onClose, 120);
          }}
        />
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: 4, flexShrink: 1 },
  label: { ...type.calloutStrong, color: palette.ink, flexShrink: 1 },
  right: { flexShrink: 0 },
});
