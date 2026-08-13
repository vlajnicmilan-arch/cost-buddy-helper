/**
 * IBAN / broj računa upisan NA NOVČANIKU.
 *
 * Vlastiti podatak korisnika — prikazuje se cijeli, bez maskiranja, u stilu
 * tehničkih podataka drugdje (mono, sitno, prigušeno). Kad ga nema, ne ostaje
 * prazan redak.
 */
interface Props {
  identifier?: string | null;
  className?: string;
}

export const WalletAccountIdentifier = ({ identifier, className }: Props) => {
  const value = String(identifier ?? '').trim();
  if (!value) return null;
  return (
    <p
      data-testid="wallet-account-identifier"
      className={`text-xs text-muted-foreground font-mono break-all ${className ?? ''}`}
    >
      {value}
    </p>
  );
};

export default WalletAccountIdentifier;
