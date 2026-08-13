/**
 * Utrka iz živog loga (20:18): rezultat skena stigne dok je popis profila još
 * prazan (profiles_count: 0 → routing_kind 'none'), profili stignu poslije.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useScanBusinessRouting } from '../useScanBusinessRouting';

const PROFILES = [
  { id: 'akrobat', name: 'Akrobat j.d.o.o.', oib: '39916265994' },
  { id: 'tactura', name: 'Tactura d.o.o.', oib: '33941873288' },
];

const scan = { recipientOib: '39916265994', recipientName: 'AKROBAT J.D.O.O.' };

const setup = (onDiagnostic?: (i: any) => void) =>
  renderHook(
    ({ profiles }: { profiles: any[] }) =>
      useScanBusinessRouting({ profiles, activeBusinessProfileId: null, onDiagnostic }),
    { initialProps: { profiles: [] as any[] } },
  );

describe('useScanBusinessRouting', () => {
  it('profili stignu nakon rezultata → routing se ponovno izračuna u auto', async () => {
    const diag = vi.fn();
    const { result, rerender } = setup(diag);

    act(() => { result.current.applyScanResult(scan); });
    expect(result.current.routing).toBeNull();
    expect(diag).toHaveBeenLastCalledWith({ routing_kind: 'none', profiles_count: 0, recomputed: false });

    rerender({ profiles: PROFILES });

    await waitFor(() => expect(result.current.routing?.mode).toBe('auto'));
    expect(result.current.routing?.profileId).toBe('akrobat');
    expect(result.current.targetProfileId).toBe('akrobat');
    expect(diag).toHaveBeenLastCalledWith({ routing_kind: 'auto', profiles_count: 2, recomputed: true });
  });

  it('ne gazi korisnikovu odluku donesenu prije dolaska profila', async () => {
    const { result, rerender } = setup();
    act(() => { result.current.applyScanResult(scan); });
    act(() => { result.current.undo(); });

    rerender({ profiles: PROFILES });
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.routing).toBeNull();
    expect(result.current.targetProfileId).toBeNull();
  });

  it('profili trajno prazni → ostaje none, bez petlje', async () => {
    const diag = vi.fn();
    const { result, rerender } = setup(diag);
    act(() => { result.current.applyScanResult(scan); });
    rerender({ profiles: [] });
    rerender({ profiles: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.routing).toBeNull();
    expect(diag).toHaveBeenCalledTimes(1);
  });

  it('profili već prisutni → auto odmah, bez ponovnog izračuna', async () => {
    const diag = vi.fn();
    const { result, rerender } = renderHook(
      ({ profiles }: { profiles: any[] }) =>
        useScanBusinessRouting({ profiles, activeBusinessProfileId: null, onDiagnostic: diag }),
      { initialProps: { profiles: PROFILES as any[] } },
    );
    act(() => { result.current.applyScanResult(scan); });
    expect(result.current.routing?.profileId).toBe('akrobat');
    rerender({ profiles: PROFILES });
    await new Promise((r) => setTimeout(r, 0));
    expect(diag).toHaveBeenCalledTimes(1);
    expect(diag).toHaveBeenLastCalledWith({ routing_kind: 'auto', profiles_count: 2, recomputed: false });
  });

  it('ponuda po imenu: prihvat postavlja cilj i zaključava ponovni izračun', async () => {
    const { result } = renderHook(() =>
      useScanBusinessRouting({ profiles: PROFILES, activeBusinessProfileId: null }),
    );
    act(() => { result.current.applyScanResult({ recipientName: 'Tactura d.o.o.' }); });
    expect(result.current.routing?.mode).toBe('offer');
    expect(result.current.targetProfileId).toBeNull();
    act(() => { result.current.acceptOffer(); });
    await waitFor(() => expect(result.current.targetProfileId).toBe('tactura'));
  });
});
