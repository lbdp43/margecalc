/**
 * FeedbackModal — « Aide & retours » (Réglages, dashboard header).
 *
 *   <FeedbackModal visible={open} onClose={() => setOpen(false)} screenName="Tableau de bord" />
 *   <FeedbackModal visible={open} onClose={…} initialTab="mine" />   // « Mes demandes »
 *
 * A full-height BottomSheet with two views:
 * - « Nouveau message »: type chips (Bug · Idée · Question), the message, an
 *   optional screenshot; « Envoyer » closes the sheet and shows a toast.
 * - « Mes demandes »: the user's requests with the team's replies. Showing
 *   the list marks every reply as read (the replies are visible right away);
 *   the « Nouvelle réponse » badge stays on them until the sheet closes.
 *
 * Browser/Android back closes the sheet first, and it closes when its screen
 * loses focus (`useSheetLifecycle`, shared with the Réglages sheets).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as ticketService from '../../services/ticket.service';
import { TICKET_MESSAGE_MAX, TICKET_TYPE_META } from '../../services/ticket.service';
import type { MyTicket, TicketType } from '../../services/ticket.service';
import { palette, radius, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { formatNumber } from '../../utils/format';
import { SETTINGS_KEYS, useMyTickets } from '../../screens/settings/parts/data';
import { formatCompactDate, formatLongDate, readableError } from '../../screens/settings/parts/helpers';
import { ErrorLine, Sheet } from '../../screens/settings/parts/ui';
import { Button, IconButton } from './Button';
import { Chip } from './Chip';
import { EmptyState } from './EmptyState';
import { SegmentedControl } from './SegmentedControl';
import { Skeleton } from './Skeleton';
import { TextField } from './TextField';
import { Badge } from './Badge';
import { PressableScale } from './PressableScale';
import { FadeIn, SwapFade } from './motion';
import { toast } from './Toast';

export interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  /** Screen the user came from (stored with the ticket). */
  screenName?: string;
  /** Which view opens first (default « Nouveau message »). */
  initialTab?: 'new' | 'mine';
}

type Tab = 'new' | 'mine';

const TYPES: TicketType[] = ['bug', 'suggestion', 'question'];

const PLACEHOLDERS: Record<TicketType, string> = {
  bug: 'Que s’est-il passé ? Sur quel écran, après quelle action ?',
  suggestion: 'Quelle fonction vous ferait gagner du temps ?',
  question: 'Posez votre question, nous répondons dans l’app.',
};

const MINE_KEY = [...SETTINGS_KEYS.mine];
const UNREAD_KEY = [...SETTINGS_KEYS.unread];
const shortDate = formatCompactDate;

export const FeedbackModal = React.memo(function FeedbackModal({ visible, onClose, screenName, initialTab = 'new' }: FeedbackModalProps) {
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>(initialTab);

  // new message
  const [kind, setKind] = useState<TicketType>('bug');
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState<{ dataUri: string; preview: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Replies marked read while this sheet is open: they keep their badge until it closes. */
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const marking = useRef(new Set<string>());

  useEffect(() => {
    if (visible) {
      setTab(initialTab);
      setError(null);
    } else {
      setFresh(new Set());
    }
  }, [visible, initialTab]);

  const mine = useMyTickets(visible);
  const unreadCount = useMemo(() => (mine.data ?? []).filter((t) => t.adminReply && !t.readByUser).length, [mine.data]);

  // « Mes demandes » shows every reply in full: showing the list reads them.
  useEffect(() => {
    if (!visible || tab !== 'mine' || !mine.data) return;
    const ids = mine.data.filter((t) => t.adminReply && !t.readByUser && !marking.current.has(t.id)).map((t) => t.id);
    if (!ids.length) return;
    ids.forEach((id) => marking.current.add(id));
    setFresh((prev) => new Set([...prev, ...ids]));
    Promise.allSettled(ids.map((id) => ticketService.markTicketRead(id))).then((results) => {
      const done = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
      ids.forEach((id) => {
        if (!done.has(id)) marking.current.delete(id); // retried next time
      });
      if (!done.size) return;
      qc.setQueryData<MyTicket[]>(MINE_KEY, (prev) => prev?.map((t) => (done.has(t.id) ? { ...t, readByUser: true } : t)));
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
    });
  }, [visible, tab, mine.data, qc]);

  const reset = () => {
    setKind('bug');
    setMessage('');
    setShot(null);
    setError(null);
  };

  const close = useCallback(() => {
    if (sending) return;
    qc.invalidateQueries({ queryKey: UNREAD_KEY });
    onClose();
  }, [sending, onClose, qc]);

  const pickScreenshot = async () => {
    setError(null);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError('Autorisez l’accès à vos photos pour joindre une capture d’écran.');
          return;
        }
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
      if (picked.canceled || !picked.assets?.[0]) return;
      setProcessing(true);
      const asset = picked.assets[0];
      const width = asset.width && asset.width < 1200 ? asset.width : 1200;
      const out = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width } }], {
        compress: 0.6,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (!out.base64) throw new Error('no base64');
      const dataUri = `data:image/jpeg;base64,${out.base64}`;
      if (dataUri.length > 2 * 1024 * 1024) {
        setError('Capture trop volumineuse (2 Mo maximum). Choisissez une image plus petite.');
        return;
      }
      setShot({ dataUri, preview: out.uri });
      haptics.select();
    } catch {
      setError('La capture n’a pas pu être lue. Essayez une autre image.');
    } finally {
      setProcessing(false);
    }
  };

  const send = async () => {
    const text = message.trim();
    if (!text) {
      haptics.warning();
      setError('Écrivez votre message avant de l’envoyer.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await ticketService.createTicket({ type: kind, message: text, screenName: screenName || null, screenshotBase64: shot?.dataUri ?? null });
      haptics.success();
      reset();
      qc.invalidateQueries({ queryKey: MINE_KEY });
      setSending(false);
      onClose();
      toast.success('Merci ! Votre message a bien été envoyé.');
    } catch (err) {
      haptics.warning();
      setError(readableError(err, 'Le message n’a pas pu être envoyé. Réessayez.').message);
      setSending(false);
    }
  };

  const footer =
    tab === 'new' ? (
      <Button
        title="Envoyer"
        icon="send"
        onPress={send}
        loading={sending}
        disabled={processing}
        testID="feedback-send"
      />
    ) : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Aide & retours"
      subline="L’équipe vous répond ici, dans l’app."
      snap="full"
      footer={footer}
      testID="feedback-sheet"
    >
      <SegmentedControl
        options={[
          { key: 'new', label: 'Nouveau message' },
          { key: 'mine', label: 'Mes demandes', hint: unreadCount ? `· ${unreadCount}` : undefined },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        accessibilityLabel="Aide et retours"
        style={{ marginBottom: 20 }}
      />
      <SwapFade value={tab}>
        {tab === 'new' ? (
          <View style={{ gap: 20 }}>
            <View>
              <Text style={styles.label}>Type de message</Text>
              <View style={styles.chips}>
                {TYPES.map((t) => (
                  <Chip
                    key={t}
                    label={TICKET_TYPE_META[t].label}
                    icon={width >= 380 ? TICKET_TYPE_META[t].icon : undefined}
                    selected={kind === t}
                    onPress={() => setKind(t)}
                  />
                ))}
              </View>
            </View>
            <TextField
              label="Votre message"
              meta={`${formatNumber(message.length)} / ${formatNumber(TICKET_MESSAGE_MAX)}`}
              value={message}
              onChangeText={(t) => {
                setMessage(t);
                if (error) setError(null);
              }}
              placeholder={PLACEHOLDERS[kind]}
              multiline
              maxLength={TICKET_MESSAGE_MAX}
              height={144}
              fieldStyle={styles.multiField}
              inputStyle={styles.multiInput}
              textAlignVertical="top"
              testID="feedback-message"
            />
            <View>
              <Text style={styles.label}>Capture d’écran · facultatif</Text>
              {shot ? (
                <View style={styles.shotRow}>
                  <Image source={{ uri: shot.preview }} style={styles.shotThumb} resizeMode="cover" accessibilityLabel="Capture jointe" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.shotTitle}>Capture jointe</Text>
                    <Text style={styles.shotMeta}>Elle sera envoyée avec votre message.</Text>
                  </View>
                  <IconButton icon="trash-outline" variant="sunken" color={palette.bad} onPress={() => setShot(null)} accessibilityLabel="Retirer la capture" />
                </View>
              ) : (
                <Button
                  title={processing ? 'Préparation…' : 'Joindre une capture d’écran'}
                  variant="secondary"
                  icon="image-outline"
                  onPress={pickScreenshot}
                  loading={processing}
                  testID="feedback-screenshot"
                />
              )}
            </View>
            <ErrorLine message={error} style={{ marginTop: -8 }} />
          </View>
        ) : (
          <MyRequests
            loading={mine.isLoading}
            error={mine.error ? readableError(mine.error, 'Vos demandes n’ont pas pu être chargées.').message : null}
            tickets={mine.data}
            fresh={fresh}
            onRetry={() => mine.refetch()}
            onWrite={() => setTab('new')}
          />
        )}
      </SwapFade>
    </Sheet>
  );
});

// ─── « Mes demandes » ──────────────────────────────────────────────────────
function MyRequests({
  loading,
  error,
  tickets,
  fresh,
  onRetry,
  onWrite,
}: {
  loading: boolean;
  error: string | null;
  tickets?: MyTicket[];
  fresh: Set<string>;
  onRetry: () => void;
  onWrite: () => void;
}) {
  if (!tickets && loading) {
    return (
      <View style={{ gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.ticket}>
            <Skeleton width="40%" height={12} />
            <Skeleton width="92%" height={12} style={{ marginTop: 10 }} />
            <Skeleton width="70%" height={12} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
    );
  }
  if (!tickets && error) {
    return <EmptyState surface="surface" icon="cloud-offline-outline" title="Chargement impossible" text={error} primary={{ label: 'Réessayer', icon: 'refresh', onPress: onRetry }} />;
  }
  if (!tickets?.length) {
    return (
      <EmptyState
        surface="surface"
        icon="chatbubbles-outline"
        title="Aucune demande pour l’instant"
        text="Vos messages et les réponses de l’équipe apparaîtront ici."
        primary={{ label: 'Écrire un message', icon: 'create-outline', onPress: onWrite }}
      />
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {tickets.map((t, i) => (
        <FadeIn key={t.id} index={i}>
          <TicketCard ticket={t} isNew={fresh.has(t.id) || (!!t.adminReply && !t.readByUser)} />
        </FadeIn>
      ))}
    </View>
  );
}

const TicketCard = React.memo(function TicketCard({ ticket, isNew }: { ticket: MyTicket; isNew: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(ticket.screenshotBase64);
  const meta = TICKET_TYPE_META[ticket.type] ?? TICKET_TYPE_META.bug;
  const unread = isNew;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !screenshot && ticket.hasScreenshot) {
      ticketService.getTicketScreenshot(ticket.id).then(setScreenshot).catch(() => {});
    }
  };

  return (
    <PressableScale
      onPress={toggle}
      scaleTo="card"
      accessibilityLabel={`${meta.label}, ${formatLongDate(ticket.createdAt)}, ${ticket.status === 'resolved' ? 'résolu' : 'en cours'}${unread ? ', nouvelle réponse' : ''}. ${expanded ? 'Réduire' : 'Afficher le détail'}`}
      accessibilityState={{ expanded }}
      style={[styles.ticket, unread && styles.ticketUnread]}
      testID="my-ticket"
    >
      <View style={styles.ticketHead}>
        <Badge variant="neutral" icon={meta.icon} label={meta.label} size="sm" />
        <Text style={styles.ticketDate}>{shortDate(ticket.createdAt)}</Text>
        {unread ? (
          <Badge variant="brand" label="Nouvelle réponse" size="sm" />
        ) : ticket.status === 'resolved' ? (
          <Badge zone="green" label="Résolu" size="sm" />
        ) : null}
      </View>
      <Text style={styles.ticketMessage} numberOfLines={expanded ? undefined : 3}>
        {ticket.message}
      </Text>
      {expanded && screenshot ? <Image source={{ uri: screenshot }} style={styles.ticketShot} resizeMode="contain" accessibilityLabel="Capture envoyée" /> : null}
      {ticket.adminReply ? (
        <View style={styles.reply}>
          <View style={styles.replyHead}>
            <Ionicons name="chatbubble-ellipses" size={15} color={palette.em700} />
            <Text style={styles.replyTitle}>Réponse de l’équipe</Text>
            {ticket.repliedAt ? <Text style={styles.replyDate}>{shortDate(ticket.repliedAt)}</Text> : null}
          </View>
          <Text style={styles.replyText} numberOfLines={expanded ? undefined : 3}>
            {ticket.adminReply}
          </Text>
        </View>
      ) : (
        <View style={styles.waiting}>
          <Ionicons name="time-outline" size={14} color={palette.text3} />
          <Text style={styles.waitingText}>{ticket.status === 'resolved' ? 'Demande traitée' : 'En attente de réponse'}</Text>
        </View>
      )}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  label: { ...type.label, color: palette.text2, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  multiField: { alignItems: 'stretch', paddingTop: 12, paddingBottom: 12 },
  multiInput: { height: '100%', textAlignVertical: 'top', lineHeight: 22 },
  shotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
  },
  shotThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: palette.surface2 },
  shotTitle: { ...type.headline, color: palette.ink },
  shotMeta: { ...type.footnote, color: palette.text3 },
  ticket: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: 14,
    gap: 10,
  },
  ticketUnread: { borderColor: palette.em300 },
  ticketHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  ticketDate: { ...type.footnote, color: palette.text3, flex: 1 },
  ticketMessage: { ...type.callout, color: palette.ink },
  ticketShot: { width: '100%', height: 220, borderRadius: radius.sm, backgroundColor: palette.surface2 },
  reply: { backgroundColor: palette.em50, borderRadius: radius.md, padding: 12, gap: 6 },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  replyTitle: { ...type.footnoteStrong, color: palette.em700 },
  replyDate: { ...type.footnote, color: palette.text3, marginLeft: 'auto' },
  replyText: { ...type.callout, color: palette.ink },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitingText: { ...type.footnote, color: palette.text3 },
});
