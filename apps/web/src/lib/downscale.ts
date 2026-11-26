import { FILE_BYTE_LIMIT, PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE, cleanFilename, fitInside, isPhotoMime } from '@app/core';

function jpegName(name: string): string {
  const stem = cleanFilename(name).replace(/\.[^.]+$/, '');
  return `${stem || 'photo'}.jpg`;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/**
 * Shrink a photo before it is uploaded. A photo whose long edge is over 2048px, or
 * that is already over 50 MB, is redrawn. JPEG, WebP, BMP and HEIC become a JPEG.
 * A PNG stays a PNG when that is smaller, so a screenshot keeps a transparent edge.
 * GIF is left alone. If the browser can't decode the file, or redrawing would make
 * it larger, the original is returned.
 */
export async function prepareUpload(file: File): Promise<File> {
  if (!isPhotoMime(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const overEdge = Math.max(bitmap.width, bitmap.height) > PHOTO_MAX_EDGE;
    const overBytes = file.size > FILE_BYTE_LIMIT;
    if (!overEdge && !overBytes) return file;

    let edge = PHOTO_MAX_EDGE;
    let quality = PHOTO_JPEG_QUALITY;
    let best: File | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const size = fitInside(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return best ?? file;
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      // First pass keeps a PNG as a PNG. Later passes fall back to JPEG to get under the cap.
      const type = file.type === 'image/png' && attempt === 0 ? 'image/png' : 'image/jpeg';
      const blob = await canvasBlob(canvas, type, type === 'image/jpeg' ? quality : undefined);
      if (!blob) return best ?? file;
      const next = new File([blob], type === 'image/jpeg' ? jpegName(file.name) : cleanFilename(file.name), {
        type,
        lastModified: file.lastModified,
      });
      if (best == null || next.size < best.size) best = next;
      if (next.size <= file.size && next.size <= FILE_BYTE_LIMIT) return next;
      edge = Math.max(1, Math.round(edge * 0.75));
      quality = Math.max(0.5, quality - 0.15);
    }
    return best != null && best.size < file.size ? best : file;
  } finally {
    bitmap.close();
  }
}
