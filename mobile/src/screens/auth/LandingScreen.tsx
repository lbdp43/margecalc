/**
 * Landing (logged out, no tab bar) — D1 mockup shot-1.
 * HeroHeader (wordmark, « Gratuit », headline, CTAs, proof points), then the
 * live teaser of the free duties calculator (opens it without an account),
 * the feature list, a closing call to action and the footer.
 * A forced sign-out (suspended account, expired session) is explained here.
 */
import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { dialog, FadeIn, HeroHeader, Screen, toast } from '../../components/ui';
import { layout } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useRatesStore } from '../../store/rates.store';
import { useNavigateOnce } from '../../hooks/useNavigateOnce';
import { openDutyCalculator, ROUTES } from '../../navigation/routes';
import { DutyTeaserCard } from './parts/DutyTeaserCard';
import { frenchQuotes, withoutTitleLead } from './parts/authErrors';
import { ClosingCard, FeatureSection, LandingFooter, LandingHeroContent } from './parts/LandingSections';

type Props = StackScreenProps<any, 'Landing'>;

export function LandingScreen({ navigation }: Props) {
  const navigate = useNavigateOnce();
  const categoryCount = useRatesStore((s) => s.rates.length) || 13;
  const notice = useAuthStore((s) => s.notice);
  const setNotice = useAuthStore((s) => s.setNotice);

  // Explain a sign-out the user did not ask for, once.
  useEffect(() => {
    if (!notice) return;
    setNotice(null);
    const message = withoutTitleLead(notice.title, frenchQuotes(notice.message));
    if (notice.kind === 'expired') toast.info(`${notice.title} : ${message.charAt(0).toLowerCase()}${message.slice(1)}`);
    else dialog.alert({ title: notice.title, message, tone: 'bad', icon: notice.kind === 'banned' ? 'lock-closed-outline' : 'alert-circle-outline' });
  }, [notice, setNotice]);

  const goRegister = useCallback(() => navigate(ROUTES.register), [navigate]);
  const goLogin = useCallback(() => navigate(ROUTES.login), [navigate]);
  const openCalculator = useCallback(() => openDutyCalculator(navigation as any), [navigation]);

  return (
    <Screen safeTop={false} padded={false} testID="landing-screen">
      <HeroHeader paddingBottom={24}>
        <View style={styles.column}>
          <LandingHeroContent onRegister={goRegister} onLogin={goLogin} categoryCount={categoryCount} />
        </View>
      </HeroHeader>

      <View style={styles.body}>
        <View style={styles.column}>
          <FadeIn index={5}>
            <DutyTeaserCard onOpen={openCalculator} delay={360} />
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
