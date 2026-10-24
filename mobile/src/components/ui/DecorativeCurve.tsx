/**
 * DEPRECATED — the Atelier decorative waves are removed from the design.
 * Kept as a no-op so existing imports still compile. Do not use.
 */
import React from 'react';

interface DecorativeCurveProps {
  variant?: 'top' | 'middle' | 'bottom';
  color?: string;
  opacity?: number;
}

export const DecorativeCurve = React.memo(function DecorativeCurve(_props: DecorativeCurveProps) {
  return null;
});
