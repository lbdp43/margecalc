/**
 * The focused route, readable outside the navigators (global chrome such as
 * the « Nouvelle version disponible » prompt, which must wait while a form is
 * open). App.tsx passes `navigationRef` to the NavigationContainer and calls
 * `syncCurrentRoute` on ready and on every state change.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import { create } from 'zustand';

export const navigationRef = createNavigationContainerRef<any>();

export const useCurrentRouteStore = create<{ name: string | null }>(() => ({ name: null }));

export function syncCurrentRoute() {
  const name = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name ?? null : null;
  if (useCurrentRouteStore.getState().name !== name) useCurrentRouteStore.setState({ name });
}
