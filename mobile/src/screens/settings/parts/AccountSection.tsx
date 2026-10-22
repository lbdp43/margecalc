/**
 * « Compte » — sign out (confirm) and delete my data (destructive confirm;
 * the account itself is kept).
 */
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ListGroup, ListRow, dialog, toast } from '../../../components/ui';
import { haptics } from '../../../theme/haptics';
import { api } from '../../../services/api';
import { clearAllOfflineData } from '../../../services/offline';
import { useAuthStore } from '../../../store/auth.store';
import { readableError } from './helpers';
import { SettingsSection } from './ui';

export function AccountSection({ index }: { index: number }) {
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const [deleting, setDeleting] = useState(false);

  const signOut = async () => {
    const ok = await dialog.confirm({
      title: 'Se déconnecter ?',
      message: 'Vous pourrez vous reconnecter à tout moment avec votre e-mail et votre mot de passe.',
      confirmLabel: 'Se déconnecter',
      icon: 'log-out-outline',
    });
    if (!ok) return;
    haptics.select();
    await logout();
    // The logged-in navigator is gone: drop every cached query so the next
    // account never sees this one's data.
    qc.clear();
  };

  const deleteData = async () => {
    const ok = await dialog.confirm({
      title: 'Supprimer toutes vos données ?',
      message:
        'Vos produits, services, contenants, catégories personnelles et demandes d’aide seront supprimés. Votre compte (e-mail et nom) est conservé. Cette action est définitive.',
      confirmLabel: 'Tout supprimer',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete('/users/me/data');
      await clearAllOfflineData().catch(() => {});
      qc.removeQueries({ queryKey: ['product'] });
      qc.removeQueries({ queryKey: ['productServings'] });
      qc.invalidateQueries();
      haptics.success();
      toast.success('Vos données ont été supprimées');
    } catch (err) {
      haptics.warning();
      await dialog.alert({
        title: 'Suppression impossible',
        message: readableError(err, 'Vos données n’ont pas pu être supprimées. Réessayez.').message,
        tone: 'bad',
        icon: 'alert-circle-outline',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SettingsSection
      title="Compte"
      index={index}
      footer="Pour supprimer votre compte, écrivez-nous depuis Aide & retours."
      testID="settings-account"
    >
      <ListGroup>
        <ListRow icon="log-out-outline" iconTone="neutral" title="Se déconnecter" right="none" onPress={signOut} testID="settings-logout" />
        <ListRow
          icon="trash-outline"
          title={deleting ? 'Suppression…' : 'Supprimer mes données'}
          subtitle="Produits, services, contenants · le compte est conservé"
          destructive
          right="none"
          disabled={deleting}
          onPress={deleteData}
          testID="settings-delete-data"
        />
      </ListGroup>
    </SettingsSection>
  );
}
