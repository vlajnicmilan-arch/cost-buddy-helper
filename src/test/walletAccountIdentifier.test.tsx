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

  it('kartica novčanika prikazuje identifikator izvora', () => {
    const panel = readFileSync(
      join(process.cwd(), 'src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx'),
      'utf8',
    );
    expect(panel).toMatch(/<WalletAccountIdentifier identifier=\{source\.account_identifier\} \/>/);
  });
});
