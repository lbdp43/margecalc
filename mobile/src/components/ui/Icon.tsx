import React from 'react';
import { Ionicons } from '@expo/vector-icons';

/** Any Ionicons glyph name (the app uses Ionicons only). */
export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color: string; style?: any }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

/** Renders an Ionicons name, or passes a custom node through. */
export function renderIcon(icon: IconName | React.ReactNode | undefined, size: number, color: string) {
  if (!icon) return null;
  if (typeof icon === 'string') return <Ionicons name={icon as IconName} size={size} color={color} />;
  return icon;
}
