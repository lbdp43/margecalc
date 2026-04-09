import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { alert } from '../../utils/alert';
import * as ticketService from '../../services/ticket.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  screenName?: string;
}

type TicketType = 'bug' | 'suggestion' | 'question';

const TYPE_OPTIONS: Array<{ value: TicketType; label: string; icon: string }> = [
  { value: 'bug', label: 'Bug', icon: 'bug-outline' },
  { value: 'suggestion', label: 'Suggestion', icon: 'bulb-outline' },
  { value: 'question', label: 'Question', icon: 'help-circle-outline' },
];

export const FeedbackModal = React.memo(function FeedbackModal({
  visible,
  onClose,
  screenName,
}: FeedbackModalProps) {
  const [type, setType] = useState<TicketType>('bug');
  const [message, setMessage] = useState('');
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const reset = () => {
    setType('bug');
    setMessage('');
    setScreenshotBase64(null);
    setScreenshotPreview(null);
  };

  const handleClose = () => {
    if (sending) return;
    reset();
    onClose();
  };

  const handlePickScreenshot = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('Permission requise', "Autorisez l'acces a la galerie pour joindre une capture.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    try {
      // Compress to keep payload reasonable
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!compressed.base64) {
        alert('Erreur', 'Impossible de lire la capture.');
        return;
      }
      setScreenshotBase64(`data:image/jpeg;base64,${compressed.base64}`);
      setScreenshotPreview(compressed.uri);
    } catch {
      alert('Erreur', 'Impossible de traiter la capture.');
    }
  };

  const handleRemoveScreenshot = () => {
    setScreenshotBase64(null);
    setScreenshotPreview(null);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      alert('Message requis', 'Decrivez le probleme ou la suggestion.');
      return;
    }
    setSending(true);
    try {
      await ticketService.createTicket({
        type,
        message: message.trim(),
        screenName: screenName || null,
        screenshotBase64,
      });
      reset();
      onClose();
      alert('Merci !', 'Votre retour a bien ete envoye. Nous allons le regarder.');
    } catch (err: any) {
      alert('Erreur', err?.response?.data?.error || "Impossible d'envoyer le ticket.");
    } finally {
      setSending(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Signaler un retour</Text>
              <Text style={styles.subtitle}>Beta MargeBar Pro — merci pour vos retours !</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              disabled={sending}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Type selector */}
            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {TYPE_OPTIONS.map((opt) => {
                const active = type === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.typeBtn, active && styles.typeBtnActive]}
                    onPress={() => setType(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={16}
                      color={active ? colors.white : colors.primary}
                    />
                    <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Message */}
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.textArea}
              value={message}
              onChangeText={setMessage}
              placeholder="Decrivez le probleme, la suggestion ou votre question..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              maxLength={4000}
            />
            <Text style={styles.helperText}>{message.length} / 4000</Text>

            {/* Screenshot */}
            <Text style={styles.label}>Capture d'ecran (optionnelle)</Text>
            {screenshotPreview ? (
              <View style={styles.screenshotPreviewWrap}>
                <Image source={{ uri: screenshotPreview }} style={styles.screenshotPreview} resizeMode="contain" />
                <TouchableOpacity
                  style={styles.screenshotRemoveBtn}
                  onPress={handleRemoveScreenshot}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={24} color={colors.marginRed} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.screenshotBtn}
                onPress={handlePickScreenshot}
                activeOpacity={0.7}
              >
                <Ionicons name="image-outline" size={20} color={colors.primary} />
                <Text style={styles.screenshotBtnText}>Capture d'ecran</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.screenshotHint}>
              Prenez une capture avec votre appareil ({Platform.OS === 'web' ? 'ex : Cmd+Shift+4 sur Mac' : 'boutons volume + marche'}), puis selectionnez-la ici.
            </Text>

            {screenName && (
              <Text style={styles.contextText}>
                Page : <Text style={{ fontWeight: '700' }}>{screenName}</Text>
              </Text>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.sendBtn, (sending || !message.trim()) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending || !message.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={18} color={colors.white} style={{ marginRight: spacing.sm }} />
              <Text style={styles.sendBtnText}>{sending ? 'Envoi...' : 'Envoyer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 38, 30, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.primary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  body: {
    maxHeight: 500,
  },
  bodyContent: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.cardBackground,
  },
  typeBtnActive: {
    backgroundColor: colors.primary,
  },
  typeBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },
  typeBtnTextActive: {
    color: colors.white,
  },
  textArea: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 120,
    ...typography.body,
    color: colors.text,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  screenshotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.light,
  },
  screenshotBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
  screenshotHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  screenshotPreviewWrap: {
    position: 'relative',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  screenshotPreview: {
    width: '100%',
    height: 180,
  },
  screenshotRemoveBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.full,
  },
  contextText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    ...shadows.md,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    ...typography.button,
    color: colors.white,
  },
});
