/**
 * Prints an HTML document using a hidden iframe instead of `window.open('', '_blank')`.
 *
 * `window.open` inside the Capacitor Android WebView creates a new blank in-app tab
 * with no chrome — the user lands on a blank page, then tapping "back" reveals the
 * generated HTML but there's no way to dismiss it without killing the app.
 *
 * The iframe approach renders silently in the current document, triggers the
 * system print dialog (Android PrintManager on native, browser print on web),
 * and self-cleans afterwards. No navigation, no new window.
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
