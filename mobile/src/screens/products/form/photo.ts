/**
 * Product photo pipeline (RC1 + scan):
 *
 *   pickImage('camera' | 'library') → the original (never sent as is)
 *   preparePhoto(img, { forOcr })    → one expensive decode of the original:
 *     - forOcr: 1 600 px JPEG (base64) for the label reading,
 *     - imageUrl: 640 px JPEG q0.7 data URI (≤ 300 000 chars) for the product,
 *     - thumbnailUrl: 160 × 160 JPEG q0.6 data URI (≤ 40 000 chars) for lists,
 *   each derivative is made from the previous, smaller image, so the slow
 *   decode of a 12 MP photo happens once (it blocks the JS thread on web).
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { PRODUCT_IMAGE_MAX_CHARS, PRODUCT_THUMBNAIL_MAX_CHARS } from '@margebar/shared';

export type PickSource = 'camera' | 'library';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

export interface PreparedPhoto {
  /** 1 600 px JPEG, raw base64 (only with `forOcr`). */
  ocrBase64?: string;
  imageUrl: string;
  thumbnailUrl: string;
}

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
 * Opens the camera or the photo library. Resolves null when cancelled.
 * Web note: a cancelled browser file chooser may never resolve, so callers
 * must not show a busy state until this resolves with an image.
 */
export async function pickImage(source: PickSource): Promise<PickedImage | null> {
  if (Platform.OS !== 'web') {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new PhotoError(
        source === 'camera'
          ? 'Autorisez l’accès à l’appareil photo dans les réglages du téléphone pour photographier l’étiquette.'
          : 'Autorisez l’accès aux photos dans les réglages du téléphone pour choisir une image.',
        'permission',
      );
    }
  }
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(PICK_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
  return toPicked(result);
}

/** Android can kill the activity while the camera is open: recover that photo on mount. */
export async function recoverPendingImage(): Promise<PickedImage | null> {
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

/** Resize so the long side is at most `max` (never upscales). */
function fitLongSide(w: number, h: number, max: number): ImageManipulator.Action[] {
  if (!(w > 0 && h > 0)) return [{ resize: { width: max } }];
  if (Math.max(w, h) <= max) return [];
  return w >= h ? [{ resize: { width: max } }] : [{ resize: { height: max } }];
}

/** Resize so the short side is `size`, then crop the centred square. */
function squareCrop(w: number, h: number, size: number): ImageManipulator.Action[] {
  if (!(w > 0 && h > 0)) return [{ resize: { width: size, height: size } }];
  const scale = size / Math.min(w, h);
  const rw = Math.max(size, Math.round(w * scale));
  const rh = Math.max(size, Math.round(h * scale));
  return [
    { resize: { width: rw, height: rh } },
    { crop: { originX: Math.floor((rw - size) / 2), originY: Math.floor((rh - size) / 2), width: size, height: size } },
  ];
}

async function jpeg(uri: string, actions: ImageManipulator.Action[], compress: number) {
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!out?.base64) throw new Error('empty');
  return out;
}

const dataUri = (b64: string) => `data:image/jpeg;base64,${b64}`;

/** Lets React paint the progress state before the (blocking) decode starts. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const raf = (globalThis as any).requestAnimationFrame as ((cb: () => void) => void) | undefined;
    if (raf) raf(() => setTimeout(resolve, 16));
    else setTimeout(resolve, 32);
  });
}

export async function preparePhoto(img: PickedImage, opts: { forOcr: boolean }): Promise<PreparedPhoto> {
  try {
    await nextPaint();
    const base = await jpeg(img.uri, fitLongSide(img.width, img.height, opts.forOcr ? 1600 : 640), opts.forOcr ? 0.82 : 0.7);
    let photo = opts.forOcr ? await jpeg(base.uri, fitLongSide(base.width, base.height, 640), 0.7) : base;
    let imageUrl = dataUri(photo.base64!);
    if (imageUrl.length > PRODUCT_IMAGE_MAX_CHARS) {
      photo = await jpeg(photo.uri, fitLongSide(photo.width, photo.height, 512), 0.55);
      imageUrl = dataUri(photo.base64!);
    }
    let thumb = await jpeg(photo.uri, squareCrop(photo.width, photo.height, 160), 0.6);
    if (dataUri(thumb.base64!).length > PRODUCT_THUMBNAIL_MAX_CHARS) {
      thumb = await jpeg(photo.uri, squareCrop(photo.width, photo.height, 120), 0.5);
    }
    return {
      ocrBase64: opts.forOcr ? base.base64 : undefined,
      imageUrl,
      thumbnailUrl: dataUri(thumb.base64!),
    };
  } catch {
    throw new PhotoError('Impossible de lire cette image. Choisissez une photo JPEG ou PNG.', 'unreadable');
  }
}
