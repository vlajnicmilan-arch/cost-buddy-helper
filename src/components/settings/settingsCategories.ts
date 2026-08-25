import { User, Palette, Bell, CreditCard, ShieldCheck, Mail, LifeBuoy, type LucideIcon } from 'lucide-react';

/**
 * Deklarativna lista kategorija postavki („predvorje").
 *
 * Premještanje sekcije među kategorijama = promjena `sections` niza ovdje.
 * Sam sadržaj sekcija živi nepromijenjen u postojećim komponentama; ovaj
 * modul samo opisuje GRUPIRANJE i redoslijed.
 */
export type SettingsSectionKey =
  | 'profile'
  | 'language'
  | 'theme'
  | 'modules'
  | 'notifications'
  | 'subscription'
  | 'security'
  | 'data'
  | 'advanced'
  | 'danger'
  | 'mailImport'
  | 'myIssuers'
  | 'myRejections'
  | 'statementSources'
  | 'help'
  | 'feedback';

export type SettingsCategoryId =
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'subscription'
  | 'data'
  | 'mail'
  | 'help';

export interface SettingsCategory {
  id: SettingsCategoryId;
  icon: LucideIcon;
  /** i18n ključ naslova kategorije. */
  titleKey: string;
  titleFallback: string;
  /** i18n ključ kratkog opisa. */
  descKey: string;
  descFallback: string;
  /** Sekcije koje se renderiraju u podekranu, ovim redoslijedom. */
  sections: SettingsSectionKey[];
  /** Kategorija postoji samo uz pravo `mail_uvoz`. */
  requiresMailAccess?: boolean;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'profile',
    icon: User,
    titleKey: 'settings.categories.profile.title',
    titleFallback: 'Profil',
    descKey: 'settings.categories.profile.desc',
    descFallback: 'Ime i jezik aplikacije',
    sections: ['profile', 'language'],
  },
  {
    id: 'appearance',
    icon: Palette,
    titleKey: 'settings.categories.appearance.title',
    titleFallback: 'Izgled',
    descKey: 'settings.categories.appearance.desc',
    descFallback: 'Tema i prikaz modula u aplikaciji',
    sections: ['theme', 'modules'],
  },
  {
    id: 'notifications',
    icon: Bell,
    titleKey: 'settings.categories.notifications.title',
    titleFallback: 'Obavijesti',
    descKey: 'settings.categories.notifications.desc',
    descFallback: 'Zvuk, push i dnevni sažetak',
    sections: ['notifications'],
  },
  {
    id: 'subscription',
    icon: CreditCard,
    titleKey: 'settings.categories.subscription.title',
    titleFallback: 'Pretplata',
    descKey: 'settings.categories.subscription.desc',
    descFallback: 'Plan, naplata i mogućnosti',
    sections: ['subscription'],
  },
  {
    id: 'data',
    icon: ShieldCheck,
    titleKey: 'settings.categories.data.title',
    titleFallback: 'Podaci i sigurnost',
    descKey: 'settings.categories.data.desc',
    descFallback: 'Pohrana, izvoz, zaključavanje i brisanje',
    sections: ['security', 'data', 'advanced', 'danger'],
  },
  {
    id: 'mail',
    icon: Mail,
    titleKey: 'settings.categories.mail.title',
    titleFallback: 'Uvoz iz e-maila',
    descKey: 'settings.categories.mail.desc',
    descFallback: 'Adresa za primanje i zapamćeni izdavatelji',
    sections: ['mailImport', 'myIssuers', 'myRejections', 'statementSources'],
    requiresMailAccess: true,
  },
  {
    id: 'help',
    icon: LifeBuoy,
    titleKey: 'settings.categories.help.title',
    titleFallback: 'Pomoć i podrška',
    descKey: 'settings.categories.help.desc',
    descFallback: 'Upute, kontakt i prijave',
    sections: ['help', 'feedback'],
  },
];

/** Kategorije vidljive u predvorju za dana prava. */
export function visibleSettingsCategories(hasMailAccess: boolean): SettingsCategory[] {
  return SETTINGS_CATEGORIES.filter((c) => !c.requiresMailAccess || hasMailAccess);
}
