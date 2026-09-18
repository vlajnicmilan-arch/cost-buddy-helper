/**
 * Predaja knjigovođi — čišćenje fotografije računa u „sken", klijentski.
 *
 * Bez AI poziva i bez novih biblioteka: canvas + jsPDF (oba već postoje).
 * Koraci: odsjecanje rubnih piksela pozadine (procjena ruba slike), siva
 * skala s ujednačavanjem svjetline (zadano) ili crno-bijelo pragu, te
 * umetanje u PDF stranicu.
 */

export interface ScanCleanupOptions {
  /** 'bw' (zadano) = crno-bijelo; 'gray' = siva skala. */
  mode?: 'bw' | 'gray';
  /** Najveća stranica slike u px (smanjuje PDF i ubrzava obradu). */
  maxSide?: number;
}

const DEFAULT_MAX_SIDE = 1600;

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_decode_failed'));
    img.src = dataUrl;
  });

/**
 * Gruba detekcija ruba računa: pozadina se procjenjuje iz kutova, a sadržaj
 * su pikseli koji se dovoljno razlikuju od nje. Bez teških biblioteka —
 * dovoljno za uklanjanje tamnog/stolnog ruba oko računa.
 */
const findContentBounds = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } => {
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const corner = (x: number, y: number) => lum[y * width + x];
  const bg =
    (corner(0, 0) + corner(width - 1, 0) + corner(0, height - 1) + corner(width - 1, height - 1)) / 4;
  const threshold = 28;

  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (Math.abs(lum[y * width + x] - bg) > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  // Mali razmak oko sadržaja, bez izlaska iz slike.
  const pad = Math.round(Math.min(width, height) * 0.01);
  return {
    x0: Math.max(0, x0 - pad),
    y0: Math.max(0, y0 - pad),
    x1: Math.min(width - 1, x1 + pad),
    y1: Math.min(height - 1, y1 + pad),
  };
};

/**
 * Očisti fotografiju računa u sken i vrati JPEG data URL.
 * Baca grešku kad sliku nije moguće pročitati ili obraditi.
 */
export const cleanupReceiptImage = async (
  dataUrl: string,
  options: ScanCleanupOptions = {},
): Promise<string> => {
  const mode = options.mode ?? 'bw';
  const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE;

  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const bounds = findContentBounds(imageData.data, width, height);
  const cropW = bounds.x1 - bounds.x0 + 1;
  const cropH = bounds.y1 - bounds.y0 + 1;

  const cropped = document.createElement('canvas');
  cropped.width = cropW;
  cropped.height = cropH;
  const cctx = cropped.getContext('2d', { willReadFrequently: true });
  if (!cctx) throw new Error('canvas_unavailable');
  cctx.drawImage(
    canvas,
    bounds.x0, bounds.y0, cropW, cropH,
    0, 0, cropW, cropH,
  );

  const out = cctx.getImageData(0, 0, cropW, cropH);
  const px = out.data;

  // Prosječna svjetlina za ujednačavanje (podloga se diže prema bijelom).
  let sum = 0;
  const count = cropW * cropH;
  for (let i = 0; i < count; i++) {
    sum += 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
  }
  const mean = sum / count;
  const gain = mean > 0 ? Math.min(2.2, 235 / mean) : 1;

  for (let i = 0; i < count; i++) {
    let l =
      (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) * gain;
    if (l > 255) l = 255;
    if (mode === 'bw') {
      // Prag crno-bijelo: čitljiv tekst na čistoj podlozi.
      l = l >= 165 ? 255 : 0;
    }
    px[i * 4] = l;
    px[i * 4 + 1] = l;
    px[i * 4 + 2] = l;
    px[i * 4 + 3] = 255;
  }
  cctx.putImageData(out, 0, 0);
  return cropped.toDataURL('image/jpeg', 0.85);
};

/**
 * Očičenu sliku umetne u jednostranični PDF (A4, slika po mjeri stranice)
 * i vrati PDF bajtove.
 */
export const imageDataUrlToPdfBytes = async (dataUrl: string): Promise<Uint8Array> => {
  const { jsPDF } = await import('jspdf');
  const img = await loadImage(dataUrl);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = img.naturalWidth * ratio;
  const h = img.naturalHeight * ratio;
  doc.addImage(dataUrl, 'JPEG', margin + (maxW - w) / 2, margin + (maxH - h) / 2, w, h);
  return doc.output('arraybuffer') as unknown as Uint8Array;
};

/** Očičena slika → PDF bajtovi, jednim pozivom. */
export const cleanupToPdfBytes = async (
  dataUrl: string,
  options: ScanCleanupOptions = {},
): Promise<Uint8Array> => imageDataUrlToPdfBytes(await cleanupReceiptImage(dataUrl, options));
