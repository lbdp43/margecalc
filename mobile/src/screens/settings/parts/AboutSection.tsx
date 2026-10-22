/**
 * « À propos » — a compact centred footer at the end of Réglages: the mark,
 * name, version and publisher, « Gratuit pour tous », and two text links
 * (the brewery's site, the contact e-mail).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandMark, Button, FadeIn, toast } from '../../../components/ui';
import { palette, type } from '../../../theme';
import { APP_VERSION, BREWERY_URL, CONTACT_EMAIL, openExternal } from './helpers';

export function AboutFooter({ index }: { index: number }) {
  const open = async (url: string) => {
    if (!(await openExternal(url))) toast.error('Le lien n’a pas pu s’ouvrir.');
  };
  return (
    <FadeIn index={index} style={styles.wrap} testID="settings-about">
      <View style={styles.brand} accessible accessibilityLabel={`MargeBar Pro, version ${APP_VERSION}, par La Brasserie des Plantes. Gratuit pour tous, sans abonnement.`}>
        <BrandMark size={28} />
        <Text style={styles.name}>
          MargeBar Pro {APP_VERSION} <Text style={styles.by}>· par La Brasserie des Plantes</Text>
        </Text>
        <Text style={styles.free}>Gratuit pour tous, sans abonnement</Text>
      </View>
      <View style={styles.links}>
        <Button title="labrasseriedesplantes.fr" variant="text" size="sm" onPress={() => open(BREWERY_URL)} testID="about-site" />
        <Text style={styles.dot} accessible={false}>
          ·
        </Text>
        <Button
          title="Nous contacter"
          variant="text"
          size="sm"
          onPress={() => open(`mailto:${CONTACT_EMAIL}`)}
          accessibilityLabel={`Nous contacter par e-mail : ${CONTACT_EMAIL}`}
          testID="about-mail"
        />
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28, alignItems: 'center' },
  brand: { alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  name: { ...type.footnoteStrong, color: palette.text2, textAlign: 'center', marginTop: 4 },
  by: { ...type.footnote, color: palette.text3 },
  free: { ...type.footnote, color: palette.text3, textAlign: 'center' },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 2 },
  dot: { ...type.footnote, color: palette.text4 },
});
