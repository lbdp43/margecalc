import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Category } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface CategoryTabsProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export const CategoryTabs = React.memo(function CategoryTabs({
  categories, selectedId, onSelect,
}: CategoryTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <CategoryPill
        active={!selectedId}
        icon="📋"
        label="Tous"
        onPress={() => onSelect(null)}
      />
      {categories.map((cat) => (
        <CategoryPill
          key={cat.id}
          active={selectedId === cat.id}
          icon={cat.icon}
          label={cat.name}
          onPress={() => onSelect(cat.id)}
        />
      ))}
    </ScrollView>
  );
});

interface PillProps {
  active: boolean;
  icon?: string | null;
  label: string;
  onPress: () => void;
}

function CategoryPill({ active, icon, label, onPress }: PillProps) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {icon ? <Text style={styles.tabIcon}>{icon}</Text> : null}
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    maxHeight: 44,
  },
  content: {
    gap: spacing.xs + 2,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm - 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardBackground,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.xs + 2,
    ...shadows.paper,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.secondary,
  },
  tabIcon: {
    fontSize: 13,
  },
  tabText: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textLight,
    fontWeight: '700',
  },
});
