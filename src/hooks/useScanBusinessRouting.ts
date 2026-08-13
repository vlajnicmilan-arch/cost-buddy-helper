/**
 * SKEN → POSLOVNI PROFIL: routing koji uvijek čita SVJEŽ popis profila.
 *
 * Dvije brane protiv utrke (profili se dohvaćaju async, sken traje ~10 s):
 *  1. profili se drže u refu, pa callback ne čita zastarjeli closure,
 *  2. ako popis stigne TEK nakon rezultata skena (prvi izračun pao na praznom
 *     popisu), routing se ponovno izračuna i panel se pojavi naknadno.
 *
 * Ograda: ponovni izračun nikad ne gazi korisnikovu odluku (undo / prihvat /
 * odbijanje ponude označe routing kao "dirnut").
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolveReceiptBusinessRouting,
  type OwnerFundingChoice,
  type RoutableBusinessProfile,
} from '@/lib/receiptBusinessRouting';

export interface ScanRoutingState {
  mode: 'auto' | 'offer';
  profileId: string;
  profileName: string;
}

export interface ScanRoutingDiagnostic {
  routing_kind: 'none' | 'auto' | 'offer';
  profiles_count: number;
  recomputed: boolean;
}

interface Params {
  profiles: readonly RoutableBusinessProfile[];
  activeBusinessProfileId: string | null | undefined;
  /** Zapis konačnog stanja routinga (instrumentacija). */
  onDiagnostic?: (info: ScanRoutingDiagnostic) => void;
}

export const useScanBusinessRouting = ({ profiles, activeBusinessProfileId, onDiagnostic }: Params) => {
  const [routing, setRouting] = useState<ScanRoutingState | null>(null);
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null);
  const [fundingChoice, setFundingChoice] = useState<OwnerFundingChoice>('owner_loan');

  const profilesRef = useRef(profiles);
  const activeIdRef = useRef(activeBusinessProfileId);
  const diagRef = useRef(onDiagnostic);
  /** Zadnji sken (za ponovni izračun kad profili kasne). */
  const pendingRef = useRef<{ recipientOib: string | null; recipientName: string | null } | null>(null);
  /** Broj profila korišten u zadnjem izračunu. */
  const lastProfilesCountRef = useRef(0);
  /** Korisnik je dirnuo panel → ne diraj više. */
  const touchedRef = useRef(false);
  const routingRef = useRef<ScanRoutingState | null>(null);

  useEffect(() => { profilesRef.current = profiles; }, [profiles]);
  useEffect(() => { routingRef.current = routing; }, [routing]);
  useEffect(() => { activeIdRef.current = activeBusinessProfileId; }, [activeBusinessProfileId]);
  useEffect(() => { diagRef.current = onDiagnostic; }, [onDiagnostic]);

  const compute = useCallback((
    input: { recipientOib: string | null; recipientName: string | null },
    recomputed: boolean,
  ) => {
    const list = profilesRef.current;
    const result = resolveReceiptBusinessRouting({
      recipientOib: input.recipientOib,
      recipientName: input.recipientName,
      profiles: list,
      activeBusinessProfileId: activeIdRef.current ?? null,
    });
    lastProfilesCountRef.current = list.length;
    if (result.kind === 'auto') {
      setRouting({ mode: 'auto', profileId: result.profileId, profileName: result.profileName });
      setTargetProfileId(result.profileId);
    } else if (result.kind === 'offer') {
      setRouting({ mode: 'offer', profileId: result.profileId, profileName: result.profileName });
      setTargetProfileId(null);
    } else {
      setRouting(null);
      setTargetProfileId(null);
    }
    try { diagRef.current?.({ routing_kind: result.kind, profiles_count: list.length, recomputed }); } catch { /* noop */ }
    return result;
  }, []);

  /** Poziva se čim stigne rezultat skena. */
  const applyScanResult = useCallback((input: { recipientOib?: string | null; recipientName?: string | null }) => {
    pendingRef.current = {
      recipientOib: input.recipientOib ?? null,
      recipientName: input.recipientName ?? null,
    };
    touchedRef.current = false;
    setFundingChoice('owner_loan');
    return compute(pendingRef.current, false);
  }, [compute]);

  // Kasni dolazak profila: prvi izračun pao na praznom popisu → ponovi.
  useEffect(() => {
    if (!pendingRef.current) return;
    if (touchedRef.current) return;
    if (lastProfilesCountRef.current !== 0) return;
    if (profiles.length === 0) return;
    compute(pendingRef.current, true);
  }, [profiles, compute]);

  const undo = useCallback(() => {
    touchedRef.current = true;
    setRouting(null);
    setTargetProfileId(null);
    setFundingChoice('owner_loan');
  }, []);

  const acceptOffer = useCallback(() => {
    touchedRef.current = true;
    if (routingRef.current) setTargetProfileId(routingRef.current.profileId);
  }, []);

  const declineOffer = useCallback(() => {
    touchedRef.current = true;
    setRouting(null);
    setTargetProfileId(null);
  }, []);

  const reset = useCallback(() => {
    pendingRef.current = null;
    touchedRef.current = false;
    lastProfilesCountRef.current = 0;
    setRouting(null);
    setTargetProfileId(null);
    setFundingChoice('owner_loan');
  }, []);

  return {
    routing,
    targetProfileId,
    fundingChoice,
    setFundingChoice,
    applyScanResult,
    undo,
    acceptOffer,
    declineOffer,
    reset,
  };
};
