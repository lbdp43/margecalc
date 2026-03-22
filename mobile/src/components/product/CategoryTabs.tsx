import React from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Category } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface CategoryTabsProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export const CategoryTabs = React.memo(function CategoryTabs({ categories, selectedId, onSelect }: CategoryTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity
        style={[styles.tab, !selectedId && styles.tabActive]}
        onPress={() => onSelect(null)}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>📋</Text>
        <Text style={[styles.tabText, !selectedId && styles.tabTextActive]}>Tous</Text>
      </TouchableOpacity>
      {categories.map((cat) => {
        const isActive = selectedId === cat.id;
        return (
          <TouchableOpacity
            key={cat.id}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.7}
          >
            {cat.icon ? (
              <Text style={styles.tabIcon}>{cat.icon}</Text>
            ) : null}
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    maxHeight: 44,
  },
  content: {
    gap: spacing.sm,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardBackground,
    gap: spacing.xs + 2,
    ...shadows.sm,
  },
  tabActive: {
    backgroundColor: colors.primary,
    ...shadows.md,
  },
  tabIcon: {
    fontSize: 14,
  },
  tabText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textLight,
  },
});
