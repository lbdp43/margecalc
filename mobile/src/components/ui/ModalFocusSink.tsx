/**
 * Web only: react-native-web's Modal focuses the first focusable descendant on
 * open. Without this, that is the full-screen scrim button, which then shows a
 * browser focus ring around the whole viewport. Render <ModalFocusSink /> as
 * the FIRST child inside a Modal: focus lands on this invisible, labelled
 * target instead, and Tab moves on to the real controls.
 */
import React from 'react';
import { Platform, View } from 'react-native';

export function ModalFocusSink({ label }: { label?: string }) {
  if (Platform.OS !== 'web') return null;
  return (
    <View
      {...({ tabIndex: -1 } as any)}
      accessibilityLabel={label}
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0, outlineStyle: 'none' } as any}
    />
  );
}
