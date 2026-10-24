/**
 * App "chrome" state shared by the floating TabBar, StickyActionBar,
 * BottomSheet and the Toast host, so overlays never stack:
 * - the Toast sits 12 px above the sticky bar, else above the tab bar;
 * - toasts are queued while a BottomSheet is open.
 * Internal to components/ui + navigation — screens do not need it.
 */
import { useContext, useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { create } from 'zustand';

interface ChromeState {
  tabBarVisible: boolean;
  stickyBars: Record<string, number>;
  sheetCount: number;
  setTabBarVisible: (v: boolean) => void;
  setStickyBar: (id: string, height: number | null) => void;
  sheetOpened: () => void;
  sheetClosed: () => void;
}

export const useChromeStore = create<ChromeState>((set) => ({
  tabBarVisible: false,
  stickyBars: {},
  sheetCount: 0,
  setTabBarVisible: (v) => set({ tabBarVisible: v }),
  setStickyBar: (id, height) =>
    set((s) => {
      const next = { ...s.stickyBars };
      if (height === null) delete next[id];
      else next[id] = height;
      return { stickyBars: next };
    }),
  sheetOpened: () => set((s) => ({ sheetCount: s.sheetCount + 1 })),
  sheetClosed: () => set((s) => ({ sheetCount: Math.max(0, s.sheetCount - 1) })),
}));

export function stickyBarHeight(state: Pick<ChromeState, 'stickyBars'>): number {
  const values = Object.values(state.stickyBars);
  return values.length ? Math.max(...values) : 0;
}

/** `useIsFocused()` that also works outside a navigator (gallery, modals). */
export function useSafeIsFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState<boolean>(() => (navigation ? navigation.isFocused() : true));
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const a = navigation.addListener('focus', () => setFocused(true));
    const b = navigation.addListener('blur', () => setFocused(false));
    return () => {
      a();
      b();
    };
  }, [navigation]);
  return focused;
}

/**
 * Keyboard height, on every platform.
 * Web: derived from `visualViewport` (iOS Safari does not resize the layout
 * viewport), so sticky bars can ride above the keyboard.
 * `enabled` false: no listener, 0 (a Screen without a sticky bar).
 */
export function useKeyboardHeight(enabled: boolean = true): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setHeight(0);
      return;
    }
    if (Platform.OS === 'web') {
      const g: any = globalThis as any;
      const vv: any = g.window ? g.window.visualViewport : null;
      if (!vv) return;
      const update = () => {
        const h = Math.max(0, g.window.innerHeight - vv.height - vv.offsetTop);
        setHeight(h > 80 ? h : 0);
      };
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      update(); // a keyboard already open when the screen mounts
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const h = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, [enabled]);
  return height;
}

let idCounter = 0;
export function nextId(prefix = 'id'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
