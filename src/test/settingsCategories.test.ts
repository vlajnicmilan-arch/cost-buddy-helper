import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SETTINGS_CATEGORIES,
  visibleSettingsCategories,
  type SettingsSectionKey,
} from '@/components/settings/settingsCategories';

const ALL_SECTIONS: SettingsSectionKey[] = [
  'profile', 'language', 'theme', 'modules', 'notifications', 'subscription',
  'security', 'data', 'advanced', 'danger', 'mailImport', 'myIssuers', 'help', 'feedback',
];

describe('settings categories (predvorje)', () => {
  it('svaka sekcija pripada točno jednoj kategoriji', () => {
    const used = SETTINGS_CATEGORIES.flatMap((c) => c.sections);
    expect([...used].sort()).toEqual([...ALL_SECTIONS].sort());
    expect(new Set(used).size).toBe(used.length);
  });

  it('mail kategorija je skrivena bez prava na uvoz iz e-maila', () => {
    expect(visibleSettingsCategories(false).some((c) => c.id === 'mail')).toBe(false);
    expect(visibleSettingsCategories(true).some((c) => c.id === 'mail')).toBe(true);
  });

  it('svaka kategorija ima i18n ključeve u hr katalogu', () => {
    const hr = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/i18n/locales/hr.json'), 'utf8'),
    );
    for (const category of SETTINGS_CATEGORIES) {
      expect(hr.settings.categories?.[category.id]?.title).toBeTruthy();
      expect(hr.settings.categories?.[category.id]?.desc).toBeTruthy();
    }
  });

  it('dijalog postavki renderira izbornik kategorija', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/settings/SettingsDialog.tsx'),
      'utf8',
    );
    expect(src).toContain('<SettingsCategoryMenu');
    expect(src).toContain('settings-subscreen-back');
  });
});
