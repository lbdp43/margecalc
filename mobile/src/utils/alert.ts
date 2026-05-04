import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert that works on both native (Alert.alert) and web (window.alert/confirm).
 */
export function alert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export function confirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmText = 'OK',
  destructive = false,
): void {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Annuler', style: 'cancel' },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  }
}
