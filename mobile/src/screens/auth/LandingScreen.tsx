/**
 * Landing (logged out, no tab bar) — D1 mockup shot-1.
 * HeroHeader (wordmark, « Gratuit », headline, CTAs, reassurance), then the
 * live teaser of the free duties calculator (opens it without an account),
 * the three proof points, the features, a closing call to action and the footer.
 *
 * It is the root of the logged-out stack, so it also:
 *  - drops every cached query of the previous session when it mounts (a
 *    forced sign-out never leaves one account's products in memory);
 *  - explains a sign-out the user did not ask for (suspended or deleted
 *    account, expired session), exactly once.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useQueryClient } from '@tanstack/react-query';
import { dialog, FadeIn, HeroHeader, Screen, toast } from '../../components/ui';
import { layout } from '../../theme';
import { AuthNotice, useAuthStore } from '../../store/auth.store';
import { useRatesStore } from '../../store/rates.store';
import { useNavigateOnce } from '../../hooks/useNavigateOnce';
import { openDutyCalculator, ROUTES } from '../../navigation/routes';
import { DutyTeaserCard } from './parts/DutyTeaserCard';
import { frenchQuotes, withoutTitleLead } from './parts/authErrors';
import { writeToUs } from './parts/contact';
import { ClosingCard, FeatureSection, LandingFooter, LandingHeroContent, ProofRow } from './parts/LandingSections';

type Props = StackScreenProps<any, 'Landing'>;

/** Survives a remount of the landing (navigator switch): one notice, one dialog. */
let lastShownNoticeId = 0;

function explainSignOut(notice: AuthNotice, onRegister: () => void) {
  if (notice.id === lastShownNoticeId) return;
  lastShownNoticeId = notice.id;
  const message = withoutTitleLead(notice.title, frenchQuotes(notice.message));
  if (notice.kind === 'expired') {
    toast.info(`${notice.title} : ${message.charAt(0).toLowerCase()}${message.slice(1)}`);
    return;
  }
  if (notice.kind === 'banned') {
    dialog
      .show<'mail' | null>({
        title: notice.title,
        message,
        tone: 'bad',
        icon: 'lock-closed-outline',
        actions: [
          { label: 'Nous écrire', value: 'mail', style: 'primary' },
          { label: 'OK', value: null, style: 'cancel' },
        ],
      })
      .then((choice) => {
        if (choice === 'mail') writeToUs('Compte suspendu');
      });
    return;
  }
  dialog
    .show<'register' | null>({
      title: notice.title,
      message,
      tone: 'bad',
      icon: 'alert-circle-outline',
      actions: [
        { label: 'Créer un compte', value: 'register', style: 'primary' },
        { label: 'OK', value: null, style: 'cancel' },
      ],
    })
    .then((choice) => {
      if (choice === 'register') onRegister();
    });
}

export function LandingScreen({ navigation }: Props) {
  const navigate = useNavigateOnce();
  const queryClient = useQueryClient();
  const categoryCount = useRatesStore((s) => s.rates.length) || 13;
  const notice = useAuthStore((s) => s.notice);

  const goRegister = useCallback(() => navigate(ROUTES.register), [navigate]);
  const goLogin = useCallback(() => navigate(ROUTES.login), [navigate]);
  const openCalculator = useCallback(() => openDutyCalculator(navigation as any), [navigation]);
  const goRegisterRef = useRef(goRegister);
  goRegisterRef.current = goRegister;

  // Logged out: nothing of the previous session may stay in the query cache.
  useEffect(() => {
    queryClient.clear();
  }, [queryClient]);

  // Read and clear the notice from the store in one step (never from this
  // render's value), so a re-run or a second landing instance shows nothing.
  useEffect(() => {
    if (!notice) return;
    const pending = useAuthStore.getState().consumeNotice();
    if (pending) explainSignOut(pending, () => goRegisterRef.current());
  }, [notice]);

  return (
    <Screen safeTop={false} padded={false} testID="landing-screen">
      <HeroHeader paddingBottom={24}>
        <View style={styles.column}>
          <LandingHeroContent onRegister={goRegister} onLogin={goLogin} />
        </View>
      </HeroHeader>

      <View style={styles.body}>
        <View style={styles.column}>
          <FadeIn index={4}>
            <DutyTeaserCard onOpen={openCalculator} delay={360} />
          </FadeIn>
          <FadeIn index={5}>
            <ProofRow categoryCount={categoryCount} />
          </FadeIn>
          <FadeIn index={6}>
            <FeatureSection />
          </FadeIn>
          <FadeIn index={7}>
            <ClosingCard onRegister={goRegister} onLogin={goLogin} />
          </FadeIn>
          <FadeIn index={8}>
            <LandingFooter />
          </FadeIn>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  body: { paddingHorizontal: layout.gutter, paddingTop: 20 },
});
