/**
 * « Application » — install the web app on the home screen (web only).
 *
 * - Installable here (Chrome / Edge / Android prompt, or iPhone / iPad
 *   Partager instructions) and not installed: « Installer l’application »,
 *   which runs the same flow as the dashboard card. It stays here even after
 *   « Ne plus afficher » on the card.
 * - Installed (running as the app, or installed from this browser):
 *   « Application installée », no action.
 * - On a computer the copy speaks of « sa propre fenêtre » (Chrome / Edge
 *   install into a window), elsewhere of the home screen.
 * - Neither (native app, Firefox desktop, in-app browsers…): no section.
 */
import React from 'react';
import { Platform } from 'react-native';
import { ListGroup, ListRow, useInstallFlow } from '../../../components/ui';
import { SettingsSection, useSheetLifecycle } from './ui';

export function ApplicationSection({ index }: { index: number }) {
  const flow = useInstallFlow();
  // The iOS sheet behaves like the other Réglages sheets (browser back closes it, it closes on blur).
  useSheetLifecycle(flow.sheetVisible, flow.closeSheet);

  if (Platform.OS !== 'web' || (!flow.isInstalled && !flow.canInstall)) return null;

  const installedText = flow.isDesktop ? 'MargeBar Pro est installée sur cet ordinateur' : 'MargeBar Pro est sur votre écran d’accueil';
  const installText = flow.isIOS
    ? 'Sur l’écran d’accueil, depuis Partager'
    : flow.isDesktop
      ? 'Dans sa propre fenêtre'
      : 'Accès en un geste, en plein écran';

  return (
    <SettingsSection title="Application" index={index} testID="settings-app">
      <ListGroup>
        {flow.isInstalled ? (
          <ListRow
            icon="checkmark-circle-outline"
            title="Application installée"
            subtitle={installedText}
            subtitleLines={2}
            right="none"
            accessibilityLabel={`Application installée : ${installedText}`}
            testID="settings-app-installed"
          />
        ) : (
          <ListRow
            icon="download-outline"
            title="Installer l’application"
            subtitle={installText}
            subtitleLines={2}
            onPress={() => {
              flow.install();
            }}
            testID="settings-install-app"
          />
        )}
      </ListGroup>
      {flow.sheet}
    </SettingsSection>
  );
}
