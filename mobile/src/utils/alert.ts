/**
 * Legacy alert/confirm API — now rendered by the in-app Dialog and Toast
 * hosts (never window.alert / window.confirm, which browsers can block).
 *
 *   alert('Succès', 'Paramètres mis à jour')   → success toast « Paramètres mis à jour »
 *   alert('Erreur', 'Impossible de sauvegarder') → dialog with an OK button
 *   confirm('Supprimer', 'Supprimer ce produit ?', onConfirm, 'Supprimer', true)
 *
 * New code should call `toast.*` / `dialog.*` from components/ui directly
 * (or the promise helpers below).
 */
import { dialog } from '../components/ui/Dialog';
import { toast } from '../components/ui/Toast';

const SUCCESS_TITLE = /^(succ[eè]s|success|merci|enregistr|ajout[ée]|supprim[ée]|mis(e)? à jour|copi[ée]|envoy[ée]|r[ée]ponse envoy|compte supprim|brouillon sauvegard|c['’]est fait|parfait|bravo)/i;

/**
 * Show an informational message. Success messages become a toast; anything
 * else (errors, warnings, permissions) a dialog the user acknowledges.
 */
export function alert(title: string, message?: string): void {
  const t = (title || '').trim();
  if (SUCCESS_TITLE.test(t)) {
    const isGeneric = /^(succ[eè]s|success|merci !?|enregistr[ée]?|parfait|bravo)$/i.test(t);
    toast.success(message && (isGeneric || message.length < 90) ? (isGeneric ? message : `${t} · ${message}`) : t);
    return;
  }
  const isError = /^(erreur|error|oups|impossible|[ée]chec|lecture impossible)/i.test(t);
  dialog.alert({
    title: t || 'Information',
    message,
    icon: isError ? 'alert-circle-outline' : /permission/i.test(t) ? 'lock-closed-outline' : undefined,
    tone: isError ? 'bad' : 'brand',
  });
}

/** Ask for confirmation; `onConfirm` runs only if the user confirms. */
export function confirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = 'OK',
  destructive = false,
): void {
  dialog
    .confirm({ title, message, confirmLabel: confirmText === 'OK' ? 'Confirmer' : confirmText, destructive })
    .then((ok) => {
      if (ok) onConfirm();
    });
}

/** Promise version: `if (await confirmAsync('Supprimer ?', '…', 'Supprimer', true)) …` */
export function confirmAsync(title: string, message?: string, confirmText = 'Confirmer', destructive = false): Promise<boolean> {
  return dialog.confirm({ title, message, confirmLabel: confirmText, destructive });
}

/** Promise version of alert as a dialog. */
export function alertAsync(title: string, message?: string): Promise<void> {
  return dialog.alert({ title, message });
}

export { toast, dialog };
