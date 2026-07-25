// Downscale + re-encode uploads before they reach Storage.
//
// WHY: the bucket held 135 files averaging ~900 kB, several over 3 MB and one at
// 7.8 MB — full-size PNGs straight from a phone or Figma. At ~30 MB per client
// that caps the 1 GB Storage tier at roughly 33 clients, and it is also the main
// reason a client's portfolio is slow to load on mobile data. Re-encoding to
// WebP at a sane dimension typically cuts a 900 kB PNG to well under 150 kB, so
// the same quota holds several hundred clients and pages load faster.
//
// Everything here degrades safely: if anything at all goes wrong (no canvas, an
// unreadable file, a codec the browser lacks) the ORIGINAL file is returned and
// the upload proceeds exactly as before. Compression is an optimisation, never a
// gate — a failure here must not stop someone publishing their portfolio.

export const MAX_IMAGE_DIMENSION = 1600; // longest edge for photos/banners/covers
export const MAX_AVATAR_DIMENSION = 800; // profile pictures and logos render small
export const WEBP_QUALITY = 0.82;        // visually lossless at these sizes

// Scale a box down to fit `max` on its longest edge, preserving aspect ratio.
// Never scales UP — a small image is left at its own size.
export function fitWithin(width, height, max) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

// Formats we deliberately pass through untouched.
export function shouldSkipCompression(file) {
  if (!file || !file.type) return true;
  // Vector: rasterising it would make it bigger AND worse.
  if (file.type === 'image/svg+xml') return true;
  // Canvas re-encoding keeps only the first frame, silently killing the
  // animation. Better to upload the original than to break it.
  if (file.type === 'image/gif') return true;
  return false;
}

export function replaceExtension(name, ext) {
  const base = String(name || 'image').replace(/\.[^./\\]+$/, '');
  return `${base || 'image'}.${ext}`;
}

// Extension to use in the storage path, derived from the MIME type we actually
// produced rather than from the original filename (which may now be wrong).
export function fileExtension(file) {
  const fromType = String(file?.type || '').split('/')[1];
  if (fromType) return fromType === 'jpeg' ? 'jpg' : fromType.replace('+xml', '');
  const m = String(file?.name || '').match(/\.([^./\\]+)$/);
  return m ? m[1].toLowerCase() : 'bin';
}

// Browser-only. Returns a NEW File on success, or the original file unchanged.
export async function compressImage(file, { maxDimension = MAX_IMAGE_DIMENSION, quality = WEBP_QUALITY } = {}) {
  if (shouldSkipCompression(file)) return file;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);
    if (!width || !height) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    // toBlob yields null if the browser cannot encode WebP.
    if (!blob) return file;
    // An already-optimised image can come out larger; keep whichever is smaller
    // so this can never make an upload worse.
    if (blob.size >= file.size) return file;

    return new File([blob], replaceExtension(file.name, 'webp'), {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.error('[upload] compression failed, using original:', err);
    return file;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

export default compressImage;
