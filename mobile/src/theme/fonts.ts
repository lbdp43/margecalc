/**
 * Plus Jakarta Sans — the only font family of the app.
 * Each weight is its own family name (see `fontFamily` in ./index.ts).
 *
 * `fontAssets` is passed to `useFonts` in App.tsx.
 * `installWebFontAliases()` (web only) registers extra @font-face rules so
 * that legacy styles which still combine a Jakarta family with `fontWeight`
 * or `fontStyle: 'italic'` render the REAL weight upright instead of a
 * browser-faked bold/italic. New components never set fontWeight/fontStyle.
 */
import { Platform } from 'react-native';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';

export const fontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

const WEIGHT_FILE: Record<number, keyof typeof fontAssets> = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
  900: 'PlusJakartaSans_800ExtraBold',
};

let installed = false;

export function installWebFontAliases(): void {
  if (installed || Platform.OS !== 'web' || typeof document === 'undefined') return;
  installed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Asset } = require('expo-asset');
    const uri = (name: keyof typeof fontAssets): string | null => {
      try {
        return Asset.fromModule(fontAssets[name]).uri || null;
      } catch {
        return null;
      }
    };
    const rules: string[] = [];
    (Object.keys(fontAssets) as (keyof typeof fontAssets)[]).forEach((family) => {
      const own = uri(family);
      if (!own) return;
      // Italic requests → upright glyphs of the same weight (no faux italic).
      rules.push(`@font-face{font-family:${family};font-style:italic;font-weight:100 400;src:url(${own});font-display:swap}`);
      [500, 600, 700, 800, 900].forEach((w) => {
        const file = uri(WEIGHT_FILE[w]);
        if (!file) return;
        rules.push(`@font-face{font-family:${family};font-weight:${w};src:url(${file});font-display:swap}`);
        rules.push(`@font-face{font-family:${family};font-style:italic;font-weight:${w};src:url(${file});font-display:swap}`);
      });
    });
    const el = document.createElement('style');
    el.id = 'margebar-font-aliases';
    el.appendChild(document.createTextNode(rules.join('\n')));
    document.head.appendChild(el);
  } catch {
    // purely cosmetic — ignore
  }
}
