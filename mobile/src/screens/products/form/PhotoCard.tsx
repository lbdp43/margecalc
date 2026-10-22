/**
 * Product photo row of the form: a 76 px preview (or an em50 placeholder) with
 * « Remplacer » / « Retirer », or « Ajouter une photo ». The photo is stored
 * as a 640 px JPEG plus a 160 px thumbnail (see photo.ts).
 */
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import type { PhotoState } from './model';

interface PhotoCardProps {
  photo: PhotoState;
  busy: boolean;
  error?: string;
  onAdd: () => void;
  onRemove: () => void;
}

export function PhotoCard({ photo, busy, error, onAdd, onRemove }: PhotoCardProps) {
  const uri = photo.imageUrl ?? photo.thumbnailUrl;
  const subtitle = busy
    ? 'Préparation de la photo…'
    : uri
      ? photo.source === 'scan'
        ? 'Prise au scan · affichée dans votre liste'
        : 'Affichée dans votre liste et la fiche'
      : 'Facultative · aide à reconnaître le produit';
  return (
    <Card padding={12} style={[styles.card, error ? styles.cardError : null]}>
      <View style={styles.row}>
        <View style={styles.thumb}>
          {uri ? (
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Photo du produit" />
          ) : (
            <Ionicons name="camera-outline" size={26} color={palette.em700} />
          )}
          {busy ? (
            <View style={[StyleSheet.absoluteFill, styles.busy]}>
              <ActivityIndicator color={uri ? '#FFFFFF' : palette.em700} />
            </View>
          ) : null}
        </View>
        <View style={styles.texts}>
          <Text style={styles.title}>Photo du produit</Text>
          <Text style={[styles.subtitle, error ? { color: palette.bad } : null]} numberOfLines={2}>
            {error ?? subtitle}
          </Text>
          <View style={styles.actions}>
            {uri ? (
              <>
                <Button title="Remplacer" variant="tonal" size="sm" icon="camera-outline" onPress={onAdd} disabled={busy} style={styles.btn} testID="photo-replace" />
                <Button title="Retirer" variant="text" size="sm" onPress={onRemove} disabled={busy} style={styles.btnText} testID="photo-remove" />
              </>
            ) : (
              <Button title="Ajouter une photo" variant="tonal" size="sm" icon="camera-outline" onPress={onAdd} disabled={busy} style={styles.btn} testID="photo-add" />
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {},
  cardError: { borderColor: palette.bad, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  busy: { backgroundColor: 'rgba(11,28,21,0.28)', alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  title: { ...type.headline, color: palette.ink },
  subtitle: { ...type.footnote, color: palette.text3, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, flexWrap: 'wrap' },
  btn: { paddingHorizontal: 14 },
  btnText: { paddingHorizontal: 10 },
});
