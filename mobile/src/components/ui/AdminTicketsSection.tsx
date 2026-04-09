import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alert, confirm } from '../../utils/alert';
import * as ticketService from '../../services/ticket.service';
import type { Ticket, TicketStatus } from '../../services/ticket.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  bug: { label: 'Bug', icon: 'bug-outline', color: '#C0392B' },
  suggestion: { label: 'Suggestion', icon: 'bulb-outline', color: '#E67E22' },
  question: { label: 'Question', icon: 'help-circle-outline', color: '#2D6A4F' },
};

interface Props {
  refreshKey?: number;
}

export function AdminTicketsSection({ refreshKey }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | TicketStatus>('open');
  const [previewTicket, setPreviewTicket] = useState<Ticket | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ticketService.getTickets();
      setTickets(data);
    } catch {
      alert('Erreur', 'Impossible de charger les tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleToggleStatus = async (ticket: Ticket) => {
    const newStatus: TicketStatus = ticket.status === 'open' ? 'resolved' : 'open';
    try {
      await ticketService.updateTicketStatus(ticket.id, newStatus);
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status: newStatus } : t)));
    } catch {
      alert('Erreur', 'Impossible de mettre a jour le ticket.');
    }
  };

  const handleDelete = (ticket: Ticket) => {
    confirm(
      'Supprimer le ticket',
      `Supprimer ce ticket de ${ticket.user.email} ?`,
      async () => {
        try {
          await ticketService.deleteTicket(ticket.id);
          setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
          if (previewTicket?.id === ticket.id) setPreviewTicket(null);
        } catch {
          alert('Erreur', 'Impossible de supprimer.');
        }
      },
      'Supprimer',
      true,
    );
  };

  const openPreview = (ticket: Ticket) => {
    setPreviewTicket(ticket);
    setReplyDraft(ticket.adminReply || '');
  };

  const closePreview = () => {
    setPreviewTicket(null);
    setReplyDraft('');
  };

  const handleSendReply = async () => {
    if (!previewTicket) return;
    if (!replyDraft.trim()) {
      alert('Reponse vide', 'Ecrivez une reponse avant de l\'envoyer.');
      return;
    }
    setSendingReply(true);
    try {
      await ticketService.replyToTicket(previewTicket.id, replyDraft.trim());
      const now = new Date().toISOString();
      setTickets((prev) =>
        prev.map((t) =>
          t.id === previewTicket.id
            ? { ...t, adminReply: replyDraft.trim(), repliedAt: now, readByUser: false }
            : t,
        ),
      );
      setPreviewTicket((prev) =>
        prev ? { ...prev, adminReply: replyDraft.trim(), repliedAt: now, readByUser: false } : null,
      );
      alert('Reponse envoyee', 'L\'utilisateur la verra a sa prochaine connexion.');
    } catch (err: any) {
      alert('Erreur', err?.response?.data?.error || 'Impossible d\'envoyer la reponse.');
    } finally {
      setSendingReply(false);
    }
  };

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);
  const openCount = tickets.filter((t) => t.status === 'open').length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.accent, { backgroundColor: colors.primary }]} />
        <Text style={styles.title}>Tickets / Retours beta</Text>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color={colors.textLight} />
          <Text style={styles.badgeText}>Admin</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.desc}>
          {openCount} ticket{openCount > 1 ? 's' : ''} ouvert{openCount > 1 ? 's' : ''} · {tickets.length} au total
        </Text>

        {/* Filter */}
        <View style={styles.filterRow}>
          {(['open', 'resolved', 'all'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'open' ? 'Ouverts' : f === 'resolved' ? 'Resolus' : 'Tous'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.reloadBtn}
            onPress={load}
            disabled={loading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="refresh" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>
            {loading ? 'Chargement...' : 'Aucun ticket dans cette vue.'}
          </Text>
        ) : (
          filtered.map((t) => {
            const meta = TYPE_META[t.type] || TYPE_META.bug;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.ticket, t.status === 'resolved' && styles.ticketResolved]}
                onPress={() => openPreview(t)}
                activeOpacity={0.7}
              >
                <View style={styles.ticketHeader}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  <Text style={[styles.ticketType, { color: meta.color }]}>{meta.label}</Text>
                  <Text style={styles.ticketDate}>
                    {new Date(t.createdAt).toLocaleDateString('fr-FR')} · {new Date(t.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {t.screenshotBase64 && (
                    <Ionicons name="image" size={14} color={colors.textSecondary} style={{ marginLeft: 6 }} />
                  )}
                  {t.adminReply && (
                    <Ionicons
                      name="chatbubble-ellipses"
                      size={14}
                      color={t.readByUser ? colors.textSecondary : colors.primary}
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </View>
                <Text style={styles.ticketMessage} numberOfLines={2}>{t.message}</Text>
                <View style={styles.ticketFooter}>
                  <Text style={styles.ticketMeta} numberOfLines={1}>
                    {t.user.businessName || t.user.email}
                    {t.screenName ? ` · ${t.screenName}` : ''}
                  </Text>
                  <View style={[styles.statusBadge, t.status === 'open' ? styles.statusOpen : styles.statusResolved]}>
                    <Text style={styles.statusText}>{t.status === 'open' ? 'Ouvert' : 'Resolu'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Detail preview modal */}
      <Modal
        visible={!!previewTicket}
        transparent
        animationType="slide"
        onRequestClose={closePreview}
      >
        <KeyboardAvoidingView
          style={styles.previewOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.previewSheet}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Detail du ticket</Text>
              <TouchableOpacity
                onPress={closePreview}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.previewContent} keyboardShouldPersistTaps="handled">
              {previewTicket && (
                <>
                  <View style={styles.previewTopRow}>
                    <Ionicons
                      name={(TYPE_META[previewTicket.type] || TYPE_META.bug).icon as any}
                      size={18}
                      color={(TYPE_META[previewTicket.type] || TYPE_META.bug).color}
                    />
                    <Text
                      style={[styles.previewTypeLabel, { color: (TYPE_META[previewTicket.type] || TYPE_META.bug).color }]}
                    >
                      {(TYPE_META[previewTicket.type] || TYPE_META.bug).label}
                    </Text>
                    <View style={[styles.statusBadge, previewTicket.status === 'open' ? styles.statusOpen : styles.statusResolved]}>
                      <Text style={styles.statusText}>{previewTicket.status === 'open' ? 'Ouvert' : 'Resolu'}</Text>
                    </View>
                  </View>

                  <Text style={styles.previewMeta}>
                    {previewTicket.user.email}
                    {previewTicket.user.businessName ? ` — ${previewTicket.user.businessName}` : ''}
                  </Text>
                  <Text style={styles.previewMeta}>
                    {new Date(previewTicket.createdAt).toLocaleString('fr-FR')}
                    {previewTicket.screenName ? ` · ${previewTicket.screenName}` : ''}
                  </Text>

                  <Text style={styles.previewLabel}>Message</Text>
                  <Text style={styles.previewMessage}>{previewTicket.message}</Text>

                  {previewTicket.screenshotBase64 && (
                    <>
                      <Text style={styles.previewLabel}>Capture d'ecran</Text>
                      <Image
                        source={{ uri: previewTicket.screenshotBase64 }}
                        style={styles.previewScreenshot}
                        resizeMode="contain"
                      />
                    </>
                  )}

                  {/* Admin reply */}
                  <Text style={styles.previewLabel}>
                    {previewTicket.adminReply ? 'Modifier la reponse' : 'Repondre a l\'utilisateur'}
                  </Text>
                  {previewTicket.adminReply && previewTicket.repliedAt && (
                    <Text style={styles.replyInfo}>
                      Derniere reponse le {new Date(previewTicket.repliedAt).toLocaleString('fr-FR')}
                      {previewTicket.readByUser ? ' · Lue' : ' · Non lue'}
                    </Text>
                  )}
                  <TextInput
                    style={styles.replyInput}
                    value={replyDraft}
                    onChangeText={setReplyDraft}
                    placeholder="Votre reponse..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    textAlignVertical="top"
                    maxLength={4000}
                  />
                  <TouchableOpacity
                    style={[styles.replySendBtn, (!replyDraft.trim() || sendingReply) && styles.replySendBtnDisabled]}
                    onPress={handleSendReply}
                    disabled={!replyDraft.trim() || sendingReply}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="send" size={14} color={colors.white} />
                    <Text style={styles.replySendBtnText}>
                      {sendingReply
                        ? 'Envoi...'
                        : previewTicket.adminReply
                          ? 'Mettre a jour la reponse'
                          : 'Envoyer la reponse'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.previewActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnPrimary]}
                      onPress={() => {
                        handleToggleStatus(previewTicket);
                        setPreviewTicket((prev) => prev ? { ...prev, status: prev.status === 'open' ? 'resolved' : 'open' } : null);
                      }}
                    >
                      <Ionicons
                        name={previewTicket.status === 'open' ? 'checkmark-circle' : 'arrow-undo'}
                        size={16}
                        color={colors.white}
                      />
                      <Text style={styles.actionBtnText}>
                        {previewTicket.status === 'open' ? 'Marquer resolu' : 'Rouvrir'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDanger]}
                      onPress={() => handleDelete(previewTicket)}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.white} />
                      <Text style={styles.actionBtnText}>Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  accent: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textLight,
    fontWeight: '700',
  },
  body: {
    padding: spacing.md,
  },
  desc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  filterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.white,
  },
  reloadBtn: {
    marginLeft: 'auto',
    padding: 4,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  ticket: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  ticketResolved: {
    opacity: 0.6,
    borderLeftColor: colors.textSecondary,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.xs,
  },
  ticketType: {
    ...typography.caption,
    fontWeight: '700',
    marginLeft: 4,
  },
  ticketDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: 'auto',
  },
  ticketMessage: {
    ...typography.bodySmall,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ticketMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusOpen: {
    backgroundColor: colors.marginOrange,
  },
  statusResolved: {
    backgroundColor: colors.marginGreen,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
    fontSize: 10,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 38, 30, 0.6)',
    justifyContent: 'flex-end',
  },
  previewSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  previewContent: {
    padding: spacing.lg,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  previewTypeLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  previewMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  previewLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  previewMessage: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewScreenshot: {
    width: '100%',
    height: 300,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  replyInfo: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontStyle: 'italic',
  },
  replyInput: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 100,
    ...typography.body,
    color: colors.text,
  },
  replySendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  replySendBtnDisabled: {
    opacity: 0.5,
  },
  replySendBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.white,
  },
  previewActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
  },
  actionBtnDanger: {
    backgroundColor: colors.marginRed,
  },
  actionBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.white,
  },
});
