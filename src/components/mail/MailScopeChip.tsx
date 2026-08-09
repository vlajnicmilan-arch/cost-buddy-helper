import { useTranslation } from 'react-i18next';
import { Building2, User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BusinessProfileLite } from '@/hooks/useBusinessProfiles';

/**
 * MAIL UVOZ — ODREDIŠTE STAVKE (chip + ručna korekcija).
 *
 * Worker usmjerava po OIB-u primatelja, ali zadnju riječ ima korisnik: izbor
 * ovdje je ODLUKA i kasnija ponovna obrada je ne smije pregaziti
 * (`scope_set_by_user` u bazi).
 */
export const MailScopeChip = ({
  scopeType,
  scopeId,
  profiles,
  disabled,
  onChange,
}: {
  scopeType: string | null;
  scopeId: string | null;
  profiles: BusinessProfileLite[];
  disabled?: boolean;
  onChange: (scopeType: 'user' | 'business_profile', scopeId: string | null) => void;
}) => {
  const { t } = useTranslation();
  const isBusiness = scopeType === 'business_profile';
  const value = isBusiness && scopeId ? scopeId : 'user';

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) =>
        next === 'user' ? onChange('user', null) : onChange('business_profile', next)
      }
    >
      <SelectTrigger
        aria-label={t('documents.scope.label', 'Odredište dokumenta')}
        className="h-7 w-auto gap-1 rounded-full border-dashed px-3 text-xs"
      >
        {isBusiness ? (
          <Building2 className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <User className="h-3.5 w-3.5 shrink-0" />
        )}
        <SelectValue placeholder={t('documents.scope.personal', 'Osobno')} />
      </SelectTrigger>
      <SelectContent className="z-[70]">
        <SelectItem value="user">{t('documents.scope.personal', 'Osobno')}</SelectItem>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
