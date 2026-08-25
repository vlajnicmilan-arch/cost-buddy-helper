/**
 * Guard: IBAN upisan na novčaniku je vidljiv (pun, mono, prigušen);
 * bez identifikatora nema praznog retka.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WalletAccountIdentifier } from '@/components/custom-payment-sources/WalletAccountIdentifier';

describe('WalletAccountIdentifier', () => {
  it('prikazuje pun IBAN bez maskiranja', () => {
    render(<WalletAccountIdentifier identifier="HR1723600001101234565" />);
    const el = screen.getByTestId('wallet-account-identifier');
    expect(el).toHaveTextContent('HR1723600001101234565');
    expect(el.className).toContain('font-mono');
    expect(el.className).toContain('text-xs');
    expect(el.className).toContain('break-all');
  });

  it('bez identifikatora ne prikazuje ništa', () => {
    const { container } = render(<WalletAccountIdentifier identifier={null} />);
    expect(container.firstChild).toBeNull();
    const blank = render(<WalletAccountIdentifier identifier="   " />);
    expect(blank.container.firstChild).toBeNull();
  });

  /**
   * IBAN je 19.8. preselio s POPISA računa u DETALJ računa: popis je stisnut
   * na jedan redak po računu, a jamstvo "IBAN je vidljiv" ostaje — samo se
   * čuva na novom mjestu. Popis ga namjerno više ne crta.
   */
  it('detalj računa prikazuje identifikator izvora', () => {
    const dialog = readFileSync(
      join(process.cwd(), 'src/components/PaymentSourceTransactionsDialog.tsx'),
      'utf8',
    );
    expect(dialog).toMatch(/<WalletAccountIdentifier identifier=\{paymentSource\.account_identifier\} \/>/);
  });

  it('popis računa više ne crta identifikator (stisnut redak)', () => {
    const panel = readFileSync(
      join(process.cwd(), 'src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx'),
      'utf8',
    );
    expect(panel).not.toMatch(/<WalletAccountIdentifier/);
  });
});
