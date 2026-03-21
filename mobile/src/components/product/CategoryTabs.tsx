import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Category } from '@margebar/shared';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface CategoryTabsProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryTabs({ categories, selectedId, onSelect }: CategoryTabsProps) {
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
        <Text style={[styles.tabText, !selectedId && styles.tabTextActive]}>Tous</Text>
      </TouchableOpacity>
      {categories.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={[styles.tab, selectedId === cat.id && styles.tabActive]}
          onPress={() => onSelect(cat.id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, selectedId === cat.id && styles.tabTextActive]}>
            {cat.icon} {cat.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.inputBackground,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textLight,
  },
});
