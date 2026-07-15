/**
 * Klijentska kompresija slika — canvas resize → JPEG.
 *
 * Extracted iz useReceiptScanner (Faza 3 Modul Odluke) kako bi se
 * ista logika mogla dijeliti između scannera i prilog-uploada.
 *
 * BITNO: default parametri (maxWidth 1600, quality 0.9) su IDENTIČNI
 * dosadašnjima u receipt scanneru — nemoj mijenjati bez razloga jer
 * može utjecati na OCR kvalitetu na sitnom tekstu.
 */

export interface CompressOptions {
  maxWidth?: number;
  quality?: number; // 0..1
}

/** Default za receipt-scanner (OCR-safe). */
export const RECEIPT_COMPRESS: Required<CompressOptions> = { maxWidth: 1600, quality: 0.9 };

/** Default za priloge odluka (~cilj 400 KB, čitko za pregled). */
export const ATTACHMENT_COMPRESS: Required<CompressOptions> = { maxWidth: 1600, quality: 0.8 };

const canRunCanvas = (): boolean =>
  typeof document !== 'undefined' && typeof Image !== 'undefined';

/**
 * Kompresija iz base64 data URL-a u novi JPEG data URL.
 * Ako browser API nije dostupan (SSR/test), vraća input netaknut.
 */
export const compressImageDataUrl = async (
  base64: string,
  opts: CompressOptions = {},
): Promise<string> => {
  const maxWidth = opts.maxWidth ?? RECEIPT_COMPRESS.maxWidth;
  const quality = opts.quality ?? RECEIPT_COMPRESS.quality;

  if (!canRunCanvas()) return base64;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      // Silent fallback — pozivač i dalje dobiva original.
      resolve(base64);
    };
    img.src = base64;
  });
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const dataUrlToFile = (dataUrl: string, fileName: string): File => {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
};

/**
 * Komprimira File (slika) → novi JPEG File. Ako je input već malen ili
 * nije slika, vraća original.
 */
export const compressImageFile = async (
  file: File,
  opts: CompressOptions = ATTACHMENT_COMPRESS,
): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  if (!canRunCanvas()) return file;
  try {
    const dataUrl = await fileToDataUrl(file);
    const compressed = await compressImageDataUrl(dataUrl, opts);
    if (!compressed.startsWith('data:')) return file;
    const stripped = file.name.replace(/\.[^.]+$/, '');
    return dataUrlToFile(compressed, `${stripped || 'image'}.jpg`);
  } catch {
    return file;
  }
};

/** Public helper — dohvaća max dimenziju iz opcija (za testove). */
export const resolveMaxWidth = (opts: CompressOptions = {}): number =>
  opts.maxWidth ?? RECEIPT_COMPRESS.maxWidth;

/** Public helper — dohvaća kvalitetu iz opcija (za testove). */
export const resolveQuality = (opts: CompressOptions = {}): number =>
  opts.quality ?? RECEIPT_COMPRESS.quality;
