/**
 * How a logged-out user reaches La Brasserie des Plantes (same address as
 * Réglages › À propos): the footer, the « Compte suspendu » dialog and banner.
 */
import { Linking } from 'react-native';

export const BREWERY_URL = 'https://labrasseriedesplantes.fr/';
export const CONTACT_EMAIL = 'labrasseriedesplantes@gmail.com';

export function openExternal(url: string): void {
  Linking.openURL(url).catch(() => {});
}

/** Opens the mail app on a new message to the brewery, with an optional subject. */
export function writeToUs(subject?: string): void {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  openExternal(`mailto:${CONTACT_EMAIL}${query}`);
}
