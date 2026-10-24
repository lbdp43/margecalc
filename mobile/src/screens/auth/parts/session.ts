/**
 * Small helpers shared by Connexion and Inscription.
 *   holdSpinner(started)          keeps the button spinner up for at least 400 ms (spec §5.9)
 *   useDraftEmail(navigation, route)  the address carried over from the other screen
 */
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../../store/auth.store';

export const MIN_SPINNER_MS = 400;

/** Waits what is left of the 400 ms minimum, on success AND on failure (no flicker). */
export async function holdSpinner(startedAt: number): Promise<void> {
  const wait = MIN_SPINNER_MS - (Date.now() - startedAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * The address typed on the other auth screen (in memory, see `draftEmail`).
 * An old link that still carries `?email=` is honoured once, then the param
 * is dropped so the address does not stay in the URL or the history.
 */
export function useDraftEmail(navigation: { setParams: (p: any) => void }, route: { params?: any }): string {
  const [initial] = useState(() => {
    const draft = useAuthStore.getState().draftEmail;
    if (draft) return draft;
    return typeof route.params?.email === 'string' ? route.params.email : '';
  });
  useEffect(() => {
    useAuthStore.getState().setDraftEmail('');
    if (route.params?.email !== undefined) navigation.setParams({ email: undefined });
    // On mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return initial;
}
