import { Capacitor } from '@capacitor/core';
import { exportFile } from './fileExport';

/**
 * Prints an HTML document.
 *
 * Web: renders into a hidden iframe and triggers `iframe.contentWindow.print()`,
 * which opens the browser print dialog without navigating away.
 *
 * Native (Capacitor Android/iOS): the system WebView does NOT honor
 * `window.print()` — calling it from JS is a silent no-op. Instead we save
 * the HTML as a file and let `FileSavedDialog` offer Open/Share, so the user
 * can open it in a system viewer that exposes its own print action.
 */
export async function printHtmlDocument(html: string, fileName = 'ispis.html'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    await exportFile(blob, fileName, 'save');
    return;
  }

  if (typeof document === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1500);
  };

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Print failed:', err);
    } finally {
      cleanup();
    }
  };

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  if (doc.readyState === 'complete') {
    window.setTimeout(triggerPrint, 150);
  } else {
    iframe.addEventListener('load', () => window.setTimeout(triggerPrint, 150), { once: true });
  }
}
