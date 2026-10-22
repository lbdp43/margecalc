/**
 * Administration › Demandes (admins only), opened from Réglages.
 *
 *   const tickets = useAdminTickets(isAdmin);
 *   <AdminTicketsSheet visible={open} onClose={() => setOpen(false)} />
 *
 * One full-height BottomSheet, two views: the list (Ouvertes / Résolues /
 * Toutes) and the detail (message, screenshot, reply, status, delete).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ticketService from '../../../services/ticket.service';
import { TICKET_MESSAGE_MAX, TICKET_TYPE_META } from '../../../services/ticket.service';
import type { Ticket, TicketStatus } from '../../../services/ticket.service';
import { Badge, Button, EmptyState, FadeIn, ListRow, SegmentedControl, Skeleton, SwapFade, TextField, dialog } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatNumber, plural } from '../../../utils/format';
import { formatShortDateTime as when, readableError } from './helpers';
import { Sheet, SheetBack, SheetFlash, SheetFlashValue, useSheetFlash } from './ui';

const TICKETS_KEY = ['admin', 'tickets'];
type Filter = 'open' | 'resolved' | 'all';

export function useAdminTickets(enabled: boolean) {
  return useQuery<Ticket[]>({
    queryKey: TICKETS_KEY,
    queryFn: ticketService.getTickets,
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

/** « 3 ouvertes · 10 au total » */
export function ticketsSummary(tickets?: Ticket[]): string | undefined {
  if (!tickets) return undefined;
  const open = tickets.filter((t) => t.status === 'open').length;
  return `${plural(open, 'ouverte', 'ouvertes')} · ${formatNumber(tickets.length)} au total`;
}

const TicketRow = React.memo(function TicketRow({ ticket, onPress, divider }: { ticket: Ticket; onPress: (t: Ticket) => void; divider: boolean }) {
  const meta = TICKET_TYPE_META[ticket.type] ?? TICKET_TYPE_META.bug;
  const who = ticket.user.businessName || ticket.user.email;
  return (
    <ListRow
      icon={meta.icon}
      iconTone={meta.tone}
      title={ticket.message.replace(/\s+/g, ' ').trim()}
      titleStyle={styles.rowTitle}
      subtitle={`${who} · ${when(ticket.createdAt)}${ticket.adminReply ? ' · répondu' : ''}`}
      subtitleLines={2}
      right={ticket.status === 'open' ? <Badge zone="orange" label="Ouverte" size="sm" noDot /> : <Badge zone="green" label="Résolue" size="sm" noDot />}
      onPress={() => onPress(ticket)}
      divider={divider}
      accessibilityLabel={`${meta.label} de ${who}, ${when(ticket.createdAt)}, ${ticket.status === 'open' ? 'ouverte' : 'résolue'} : ${ticket.message.slice(0, 120)}`}
      testID="admin-ticket-row"
    />
  );
});

export function AdminTicketsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const tickets = useAdminTickets(visible);
  const [filter, setFilter] = useState<Filter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'reply' | 'status' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [flash, showFlash, clearFlash] = useSheetFlash();

  useEffect(() => {
    if (visible) {
      setSelectedId(null);
      setError(null);
      clearFlash();
    }
  }, [visible, clearFlash]);

  const all = tickets.data ?? [];
  const counts = useMemo(() => ({ open: all.filter((t) => t.status === 'open').length, resolved: all.filter((t) => t.status === 'resolved').length }), [all]);
  const list = useMemo(() => (filter === 'all' ? all : all.filter((t) => t.status === filter)), [all, filter]);
  const selected = selectedId ? all.find((t) => t.id === selectedId) ?? null : null;

  const open = (t: Ticket) => {
    setSelectedId(t.id);
    setReply(t.adminReply ?? '');
    setError(null);
    setSent(false);
    clearFlash();
  };

  const patch = (id: string, p: Partial<Ticket> | null) =>
    qc.setQueryData<Ticket[]>(TICKETS_KEY, (prev) => (prev ? (p === null ? prev.filter((t) => t.id !== id) : prev.map((t) => (t.id === id ? { ...t, ...p } : t))) : prev));

  const sendReply = async () => {
    if (!selected) return;
    const text = reply.trim();
    if (!text) {
      haptics.warning();
      setError('Écrivez une réponse avant de l’envoyer.');
      return;
    }
    setBusy('reply');
    setError(null);
    try {
      await ticketService.replyToTicket(selected.id, text);
      patch(selected.id, { adminReply: text, repliedAt: new Date().toISOString(), readByUser: false });
      haptics.success();
      setSent(true);
      setTimeout(() => setSent(false), 1200);
      showFlash('Réponse envoyée : l’utilisateur la lira dans Aide & retours.');
    } catch (err) {
      haptics.warning();
      setError(readableError(err, 'La réponse n’a pas pu être envoyée.').message);
    } finally {
      setBusy(null);
    }
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const next: TicketStatus = selected.status === 'open' ? 'resolved' : 'open';
    setBusy('status');
    setError(null);
    try {
      await ticketService.updateTicketStatus(selected.id, next);
      patch(selected.id, { status: next });
      haptics.success();
      showFlash(next === 'resolved' ? 'Demande marquée résolue' : 'Demande rouverte');
    } catch (err) {
      haptics.warning();
      setError(readableError(err, 'Le statut n’a pas pu être modifié.').message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!selected) return;
    const ok = await dialog.confirm({
      title: 'Supprimer cette demande ?',
      message: `La demande de ${selected.user.businessName || selected.user.email} et sa réponse seront supprimées. Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await ticketService.deleteTicket(selected.id);
      haptics.success();
      patch(selected.id, null);
      setSelectedId(null);
      showFlash('Demande supprimée');
    } catch (err) {
      haptics.warning();
      setError(readableError(err, 'La demande n’a pas pu être supprimée.').message);
    } finally {
      setBusy(null);
    }
  };

  const footer = selected ? (
    <View style={styles.footerRow}>
      <Button
        title={selected.status === 'open' ? 'Résolue' : 'Rouvrir'}
        variant="secondary"
        icon={selected.status === 'open' ? 'checkmark-done' : 'arrow-undo-outline'}
        onPress={toggleStatus}
        loading={busy === 'status'}
        disabled={!!busy && busy !== 'status'}
        style={{ flex: 1 }}
        testID="admin-ticket-status"
      />
      <Button
        title={selected.adminReply ? 'Mettre à jour' : 'Répondre'}
        icon="send"
        onPress={sendReply}
        loading={busy === 'reply'}
        success={sent}
        disabled={!sent && ((!!busy && busy !== 'reply') || !reply.trim() || reply.trim() === (selected.adminReply ?? '').trim())}
        style={{ flex: 1.3 }}
        testID="admin-ticket-reply"
      />
    </View>
  ) : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={selected ? `${(TICKET_TYPE_META[selected.type] ?? TICKET_TYPE_META.bug).label} · ${selected.user.businessName || selected.user.email}` : 'Demandes des utilisateurs'}
      subline={selected ? `${selected.user.email} · ${when(selected.createdAt)}` : ticketsSummary(tickets.data) ?? 'Bugs, idées et questions'}
      snap="full"
      contentPadding={selected ? 20 : 8}
      footer={footer}
      testID="sheet-admin-tickets"
    >
      <SwapFade value={selected ? `t-${selected.id}` : 'list'}>
        {selected ? (
          <TicketDetail
            ticket={selected}
            reply={reply}
            onReply={(t) => {
              setReply(t);
              if (error) setError(null);
            }}
            error={error}
            flash={flash}
            onBack={() => {
              setSelectedId(null);
              clearFlash();
            }}
            onDelete={remove}
            deleting={busy === 'delete'}
          />
        ) : (
          <View>
            <SheetFlash flash={flash} style={{ marginHorizontal: 12, marginBottom: 12 }} />
            <View style={{ paddingHorizontal: 12, marginBottom: 8 }}>
              <SegmentedControl
                options={[
                  { key: 'open', label: 'Ouvertes', hint: tickets.data ? String(counts.open) : undefined },
                  { key: 'resolved', label: 'Résolues', hint: tickets.data ? String(counts.resolved) : undefined },
                  { key: 'all', label: 'Toutes' },
                ]}
                value={filter}
                onChange={(k) => setFilter(k as Filter)}
                accessibilityLabel="Filtrer les demandes"
              />
            </View>
            {tickets.isLoading && !tickets.data ? (
              <View style={{ paddingHorizontal: 12, gap: 10, paddingTop: 4 }}>
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={52} radius={12} />)}
              </View>
            ) : tickets.error && !tickets.data ? (
              <EmptyState surface="surface" icon="cloud-offline-outline" title="Chargement impossible" text={readableError(tickets.error, 'Les demandes n’ont pas pu être chargées.').message} primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => tickets.refetch() }} />
            ) : list.length === 0 ? (
              <EmptyState
                surface="surface"
                icon="checkmark-done-outline"
                title={filter === 'open' ? 'Aucune demande ouverte' : 'Aucune demande'}
                text={filter === 'open' ? 'Tout est traité. Les nouvelles demandes apparaîtront ici.' : 'Les bugs, idées et questions des utilisateurs apparaîtront ici.'}
              />
            ) : (
              list.map((t, i) => <TicketRow key={t.id} ticket={t} onPress={open} divider={i < list.length - 1} />)
            )}
          </View>
        )}
      </SwapFade>
    </Sheet>
  );
}

function TicketDetail({
  ticket,
  reply,
  onReply,
  error,
  flash,
  onBack,
  onDelete,
  deleting,
}: {
  ticket: Ticket;
  reply: string;
  onReply: (t: string) => void;
  error: string | null;
  flash: SheetFlashValue | null;
  onBack: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const meta = TICKET_TYPE_META[ticket.type] ?? TICKET_TYPE_META.bug;
  // The list never carries the screenshot: load it on demand (null when there is none).
  const shot = useQuery({
    queryKey: ['admin', 'ticketShot', ticket.id],
    queryFn: () => ticketService.getTicketScreenshot(ticket.id),
    staleTime: Infinity,
    retry: 0,
  });
  return (
    <View style={{ gap: 16 }}>
      <SheetBack label="Toutes les demandes" onPress={onBack} testID="admin-ticket-back" />
      <SheetFlash flash={flash} />
      <View style={styles.badges}>
        <Badge variant="neutral" icon={meta.icon} label={meta.label} size="sm" />
        {ticket.status === 'open' ? <Badge zone="orange" label="Ouverte" size="sm" noDot /> : <Badge zone="green" label="Résolue" size="sm" noDot />}
        {ticket.screenName ? <Badge variant="neutral" icon="phone-portrait-outline" label={ticket.screenName} size="sm" /> : null}
      </View>
      <View style={styles.message}>
        <Text style={styles.messageText} selectable>
          {ticket.message}
        </Text>
      </View>
      {shot.isLoading ? (
        <Skeleton height={160} radius={16} />
      ) : shot.data ? (
        <FadeIn>
          <Image source={{ uri: shot.data }} style={styles.shot} resizeMode="contain" accessibilityLabel="Capture d’écran jointe" />
        </FadeIn>
      ) : null}
      <View>
        <TextField
          label="Votre réponse"
          meta={`${formatNumber(reply.length)} / ${formatNumber(TICKET_MESSAGE_MAX)}`}
          value={reply}
          onChangeText={onReply}
          placeholder="Bonjour, merci pour votre message…"
          multiline
          maxLength={TICKET_MESSAGE_MAX}
          height={132}
          fieldStyle={styles.multiField}
          inputStyle={styles.multiInput}
          textAlignVertical="top"
          error={error}
          helper={
            ticket.adminReply && ticket.repliedAt
              ? `Répondu le ${when(ticket.repliedAt)} · ${ticket.readByUser ? 'lue' : 'pas encore lue'}`
              : 'L’utilisateur la lira dans Réglages › Aide & retours.'
          }
          testID="admin-ticket-reply-input"
        />
      </View>
      <Button
        title="Supprimer la demande"
        variant="destructive"
        size="sm"
        icon="trash-outline"
        onPress={onDelete}
        loading={deleting}
        testID="admin-ticket-delete"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', gap: 10 },
  rowTitle: { ...type.callout, color: palette.ink },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  message: { backgroundColor: palette.surface2, borderRadius: radius.md, padding: 14 },
  messageText: { ...type.body, color: palette.ink },
  shot: { width: '100%', height: 260, borderRadius: radius.md, backgroundColor: palette.surface2 },
  multiField: { alignItems: 'stretch', paddingTop: 12, paddingBottom: 12 },
  multiInput: { height: '100%', textAlignVertical: 'top', lineHeight: 22 },
});
