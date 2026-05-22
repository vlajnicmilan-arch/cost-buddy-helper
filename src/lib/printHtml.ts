/**
 * Prints an HTML document using a hidden iframe (web only).
 *
 * Native (Capacitor Android/iOS) WebView ignores `window.print()` silently —
 * callers must detect `Capacitor.isNativePlatform()` and route to a PDF
 * export instead (which the user can then print from a system PDF viewer).
 *
 * The iframe approach avoids the broken `window.open('', '_blank')` flow,
 * which inside Capacitor created a chrome-less in-app tab the user couldn't
 * exit without killing the app.
 */
export function printHtmlDocument(html: string): void {
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
