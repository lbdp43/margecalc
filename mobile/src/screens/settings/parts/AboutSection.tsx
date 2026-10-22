/**
 * « À propos » — version, publisher, free for everyone, contact.
 */
import React from 'react';
import { BrandMark, ListGroup, ListRow, toast } from '../../../components/ui';
import { APP_VERSION, BREWERY_URL, CONTACT_EMAIL, openExternal } from './helpers';
import { SettingsSection } from './ui';

export function AboutSection({ index }: { index: number }) {
  const open = async (url: string) => {
    if (!(await openExternal(url))) toast.error('Le lien n’a pas pu s’ouvrir.');
  };
  return (
    <SettingsSection title="À propos" index={index} testID="settings-about">
      <ListGroup>
        <ListRow
          leading={<BrandMark size={40} />}
          title="MargeBar Pro"
          subtitle="par La Brasserie des Plantes"
          detail={`Version ${APP_VERSION}`}
          accessibilityLabel={`MargeBar Pro, version ${APP_VERSION}, par La Brasserie des Plantes`}
        />
        <ListRow
          icon="gift-outline"
          title="Gratuit pour tous"
          subtitle="Toutes les fonctions, sans abonnement ni carte bancaire"
        />
        <ListRow
          icon="globe-outline"
          iconTone="neutral"
          title="La Brasserie des Plantes"
          subtitle="labrasseriedesplantes.fr"
          right="none"
          onPress={() => open(BREWERY_URL)}
        />
        <ListRow
          icon="mail-outline"
          iconTone="neutral"
          title="Nous écrire"
          subtitle={CONTACT_EMAIL}
          right="none"
          onPress={() => open(`mailto:${CONTACT_EMAIL}`)}
        />
      </ListGroup>
    </SettingsSection>
  );
}
