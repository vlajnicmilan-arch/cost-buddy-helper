import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyBusinessBodyTheme,
  clearBusinessBodyTheme,
} from '@/lib/businessBodyTheme';

const classes = () => Array.from(document.body.classList);

describe('business body theme', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.removeAttribute('data-business-dark');
  });

  it('adds the theme class when entering business mode', () => {
    applyBusinessBodyTheme('ocean-blue');
    expect(classes()).toContain('business-theme-ocean-blue');
  });

  it('removes the theme class when leaving business mode', () => {
    applyBusinessBodyTheme('ocean-blue');
    clearBusinessBodyTheme();
    expect(classes().filter((c) => c.startsWith('business-theme-'))).toHaveLength(0);
  });

  it('replaces the class when switching companies (never two)', () => {
    applyBusinessBodyTheme('ocean-blue');
    applyBusinessBodyTheme('emerald');
    const themeClasses = classes().filter((c) => c.startsWith('business-theme-'));
    expect(themeClasses).toEqual(['business-theme-emerald']);
  });

  it('never touches the body in personal mode', () => {
    document.body.className = 'some-app-class';
    clearBusinessBodyTheme();
    expect(document.body.className).toBe('some-app-class');
  });

  it('adds dark on body for inherently dark themes and removes it on exit', () => {
    applyBusinessBodyTheme('premium-dark');
    expect(classes()).toContain('dark');
    expect(classes()).toContain('business-theme-premium-dark');
    clearBusinessBodyTheme();
    expect(classes()).not.toContain('dark');
    expect(document.body.hasAttribute('data-business-dark')).toBe(false);
  });

  it('drops the added dark class when switching to a light business theme', () => {
    applyBusinessBodyTheme('premium-dark');
    applyBusinessBodyTheme('amber');
    expect(classes()).toEqual(['business-theme-amber']);
  });

  it('does not add dark for non-dark themes', () => {
    applyBusinessBodyTheme('teal');
    expect(classes()).not.toContain('dark');
  });
});
