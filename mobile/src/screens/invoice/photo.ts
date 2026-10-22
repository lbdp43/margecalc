/**
 * Invoice photo pipeline:
 *   pickInvoiceImage('camera' | 'library') → the original (never sent as is)
 *   prepareInvoicePhoto(img)               → ONE decode of the original:
 *     - ocrBase64: JPEG, long side ≤ 2 000 px, q 0.82 (the API rejects > 3 500 px),
 *     - previewUri: ~720 px JPEG for the screen (frame + header thumb).
 * On web the browser's canvas scaler is used (milliseconds, instead of seconds
 * for expo-image-manipulator's JavaScript resampler on the main thread); any
 * failure falls back to expo-image-manipulator.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export type PickSource = 'camera' | 'library';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export interface PreparedInvoicePhoto {
  /** Raw base64 JPEG for the OCR (long side ≤ 2 000 px). */
  ocrBase64: string;
  /** Small image for the screen. */
  previewUri: string;
  width: number;
  height: number;
}

export const OCR_MAX_SIDE = 2000;
const PREVIEW_MAX_SIDE = 720;

export class PhotoError extends Error {
  constructor(message: string, readonly kind: 'permission' | 'unreadable') {
    super(message);
    this.name = 'PhotoError';
  }
}

const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 1,
  allowsEditing: false,
  exif: false,
  base64: false,
};

function toPicked(result: ImagePicker.ImagePickerResult | null | undefined): PickedImage | null {
  if (!result || result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width || 0, height: a.height || 0 };
}

/**
 * Opens the camera or the library. Resolves null when cancelled.
 * Web: a cancelled file chooser may never resolve, so the screen must not show
 * a busy state until this resolves with an image.
 */
export async function pickInvoiceImage(source: PickSource): Promise<PickedImage | null> {
  if (Platform.OS !== 'web') {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new PhotoError(
        source === 'camera'
          ? 'Autorisez l’accès à l’appareil photo dans les réglages du téléphone pour photographier la facture.'
          : 'Autorisez l’accès aux photos dans les réglages du téléphone pour choisir la facture.',
        'permission',
      );
    }
  }
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(PICK_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
  return toPicked(result);
}

/** Android can kill the activity while the camera is open: recover that photo on mount. */
export async function recoverPendingInvoiceImage(): Promise<PickedImage | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    const first = Array.isArray(pending) ? pending[0] : null;
    if (!first || 'code' in first) return null;
    return toPicked(first as ImagePicker.ImagePickerResult);
  } catch {
    return null;
  }
}

/** Lets React paint the « préparation » state before the (blocking) decode starts. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const raf = (globalThis as any).requestAnimationFrame as ((cb: () => void) => void) | undefined;
    if (raf) raf(() => setTimeout(resolve, 16));
    else setTimeout(resolve, 32);
  });
}

// ─── Web fast path (canvas) ────────────────────────────────────────────────

type WebCanvas = { width: number; height: number; getContext: (k: '2d') => any; toDataURL: (t: string, q: number) => string };

function webCanvas(w: number, h: number): WebCanvas {
  const c = (globalThis as any).document.createElement('canvas') as WebCanvas;
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function webLoad(uri: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ImageCtor = (globalThis as any).Image;
    const el = new ImageCtor();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode'));
    el.src = uri;
  });
}

/** `src` scaled so its long side is ≤ max (never upscaled), on white (transparent PNGs). */
function webFit(src: any, sw: number, sh: number, max: number): WebCanvas {
  const scale = Math.min(1, max / Math.max(sw, sh));
  const c = webCanvas(sw * scale, sh * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const stripPrefix = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

async function prepareOnWeb(img: PickedImage): Promise<PreparedInvoicePhoto> {
  const el = await webLoad(img.uri);
  const w = el.naturalWidth || img.width;
  const h = el.naturalHeight || img.height;
  if (!(w > 0 && h > 0)) throw new Error('size');
  const ocr = webFit(el, w, h, OCR_MAX_SIDE);
  const ocrUrl = ocr.toDataURL('image/jpeg', 0.82);
  const preview = webFit(ocr, ocr.width, ocr.height, PREVIEW_MAX_SIDE).toDataURL('image/jpeg', 0.72);
  if (!ocrUrl.startsWith('data:image/jpeg') || ocrUrl.length < 200) throw new Error('encode');
  return { ocrBase64: stripPrefix(ocrUrl), previewUri: preview, width: ocr.width, height: ocr.height };
}

// ─── Native (and web fallback) ─────────────────────────────────────────────

function fitLongSide(w: number, h: number, max: number): ImageManipulator.Action[] {
  if (!(w > 0 && h > 0)) return [{ resize: { width: max } }];
  if (Math.max(w, h) <= max) return [];
  return w >= h ? [{ resize: { width: max } }] : [{ resize: { height: max } }];
}

export async function prepareInvoicePhoto(img: PickedImage): Promise<PreparedInvoicePhoto> {
  if (Platform.OS === 'web' && typeof (globalThis as any).document !== 'undefined') {
    try {
      await nextPaint();
      return await prepareOnWeb(img);
    } catch {
      /* fall back to expo-image-manipulator */
    }
  }
  try {
    await nextPaint();
    const ocr = await ImageManipulator.manipulateAsync(img.uri, fitLongSide(img.width, img.height, OCR_MAX_SIDE), {
      compress: 0.82,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (!ocr?.base64) throw new Error('empty');
    const preview = await ImageManipulator.manipulateAsync(ocr.uri, fitLongSide(ocr.width, ocr.height, PREVIEW_MAX_SIDE), {
      compress: 0.72,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { ocrBase64: ocr.base64, previewUri: preview.uri, width: ocr.width, height: ocr.height };
  } catch {
    throw new PhotoError('Impossible de lire cette image. Choisissez une photo JPEG ou PNG de la facture.', 'unreadable');
  }
}
