/**
 * ErrorBoundary — catches render errors and shows a calm recovery card.
 *   <ErrorBoundary fallbackMessage="Le tableau de bord n’a pas pu s’afficher.">…</ErrorBoundary>
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevation, fontFamily, palette, radius } from '../../theme';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
  /** Fill the screen (root boundary) instead of an inline card. */
  fullScreen?: boolean;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) console.warn('[ErrorBoundary]', error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={[styles.container, this.props.fullScreen && styles.full]}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="refresh-circle-outline" size={28} color={palette.bad} />
          </View>
          <Text style={styles.title}>Un problème est survenu</Text>
          <Text style={styles.message}>{this.props.fallbackMessage || 'Cette partie de l’application n’a pas pu s’afficher.'}</Text>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { backgroundColor: palette.em800 }, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null]}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Réessayer"
          >
            <Text style={styles.btnText}>Réessayer</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  full: { flex: 1, backgroundColor: palette.bg },
  card: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 24,
    ...elevation.e2,
  },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.badBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 24, color: palette.ink, textAlign: 'center' },
  message: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 22, color: palette.text2, textAlign: 'center', marginTop: 6 },
  btn: {
    marginTop: 20,
    height: 52,
    alignSelf: 'stretch',
    borderRadius: radius.md,
    backgroundColor: palette.em700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: fontFamily.semibold, fontSize: 17, color: '#FFFFFF' },
});
