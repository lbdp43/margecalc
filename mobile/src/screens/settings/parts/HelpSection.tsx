/**
 * « Aide & retours » — write to the team (bug / idée / question with an
 * optional screenshot) and « Mes demandes » with the unread replies badge.
 */
import React, { useState } from 'react';
import { FeedbackModal } from '../../../components/ui/FeedbackModal';
import { ListGroup, ListRow } from '../../../components/ui';
import { plural } from '../../../utils/format';
import { useUnreadReplies } from './data';
import { PillChevron, SettingsSection } from './ui';

export function HelpSection({ index }: { index: number }) {
  const unread = useUnreadReplies();
  const [open, setOpen] = useState<'new' | 'mine' | null>(null);
  const count = unread.data ?? 0;

  return (
    <SettingsSection title="Aide & retours" index={index} testID="settings-help">
      <ListGroup>
        <ListRow
          icon="chatbubble-ellipses-outline"
          title="Écrire à l’équipe"
          subtitle="Un bug, une idée, une question : réponse dans l’app"
          onPress={() => setOpen('new')}
          testID="settings-feedback"
        />
        <ListRow
          icon="file-tray-full-outline"
          title="Mes demandes"
          subtitle={count ? `${plural(count, 'nouvelle réponse', 'nouvelles réponses')} de l’équipe` : 'Vos messages et nos réponses'}
          right={<PillChevron count={count} />}
          onPress={() => setOpen('mine')}
          accessibilityLabel={`Mes demandes${count ? `, ${plural(count, 'nouvelle réponse', 'nouvelles réponses')}` : ''}`}
          testID="settings-my-requests"
        />
      </ListGroup>
      <FeedbackModal visible={open !== null} initialTab={open ?? 'new'} onClose={() => setOpen(null)} screenName="Réglages" />
    </SettingsSection>
  );
}
