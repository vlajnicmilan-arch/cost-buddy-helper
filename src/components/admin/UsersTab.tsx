import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, RefreshCw, User, Mail, Clock, Smartphone, Ban, UserCheck,
  ShieldCheck, ShieldOff, Search, X, Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { UserAccessBadges } from './users/UserAccessBadges';
import { EffectiveAccessSummary } from './users/EffectiveAccessSummary';
import { UserBillingSection } from './users/UserBillingSection';
import { UserModuleOverrideSection } from './users/UserModuleOverrideSection';
import {
  deriveEffectiveAccess,
  isGrantExpiringSoon,
  getEarliestUpcomingExpiry,
  grantReasonCodeI18nKey,
  type ActiveGrantLike,
} from '@/lib/adminAccess';
import type { DrilldownIntent } from './access/ModuleAccessOverview';
import { type AppUser, parseUserAgent, parseDetailedUA, isBanned } from './types';

type FilterKey =
  | 'all'
  | 'admin'
  | 'banned'
  | 'hasProjects'
  | 'hasBusiness'
  | 'overrideActive'
  | 'expiringOverride'
  | 'coreOnly';

interface UsersTabProps {
  users: AppUser[];
  usersLoading: boolean;
  hasMoreUsers: boolean;
  usersPage: number;
  expandedUserId: string | null;
  setExpandedUserId: (id: string | null) => void;
  actionLoading: string | null;
  currentUserId?: string;
  subscriptions?: Record<string, string>;
  subLoading?: string | null;
  onSetUserTier?: (userId: string, tier: string) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onManageUser: (action: string, userId: string, role?: string) => void;
  /** Drill-down kontekst iz ModuleAccessOverview. Konzumira se jednom. */
  pendingUserContext?: DrilldownIntent | null;
  onContextConsumed?: () => void;
}

export const UsersTab = ({
  users,
  usersLoading,
  hasMoreUsers,
  usersPage,
  expandedUserId,
  setExpandedUserId,
  actionLoading,
  currentUserId,
  subscriptions = {},
  subLoading = null,
  onSetUserTier,
  onRefresh,
  onLoadMore,
  onManageUser,
  pendingUserContext = null,
  onContextConsumed,
}: UsersTabProps) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilterRaw] = useState<FilterKey>('all');
  const [grants, setGrants] = useState<ActiveGrantLike[]>([]);
  const [activeContext, setActiveContext] = useState<DrilldownIntent | null>(null);

  // Wrapper: ručna promjena filtera briše drill-down kontekst.
  const setFilter = useCallback((k: FilterKey) => {
    setActiveContext(null);
    setFilterRaw(k);
  }, []);

  // Konzumiranje pendingUserContext: postavi activeContext + mapiraj filter.
  // Sekundarni UX: ako isti drill-down (module + source + reasonCode) već vrijedi,
  // klik na isti reason chip briše SAMO treću dimenziju. Glavni izlaz ostaje [×] na chipu.
  useEffect(() => {
    if (!pendingUserContext) return;
    setActiveContext((prev) => {
      if (
        prev &&
        pendingUserContext.module === prev.module &&
        pendingUserContext.source === 'override' &&
        prev.source === 'override' &&
        pendingUserContext.reasonCode &&
        pendingUserContext.reasonCode === prev.reasonCode
      ) {
        // Toggle: skini samo reasonCode, zadrži module + source.
        return { module: prev.module, source: prev.source };
      }
      return pendingUserContext;
    });
    setFilterRaw(
      pendingUserContext.module === 'projects' ? 'hasProjects' : 'hasBusiness'
    );
    onContextConsumed?.();
  }, [pendingUserContext, onContextConsumed]);

  const loadGrants = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('admin_module_grants')
      .select('user_id, module, revoked_at, expires_at, reason_code')
      .is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    setGrants(
      (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        module: r.module,
        revoked_at: r.revoked_at,
        expires_at: r.expires_at,
        reason_code: r.reason_code,
      }))
    );
  }, []);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  const now = useMemo(() => new Date(), [grants]);

  // Grantovi koji ističu < 7 dana (za ⏳ akcent na badgeu)
  const expiringSoonGrants = useMemo(() => {
    return grants
      .filter((g) => isGrantExpiringSoon(g, now))
      .map((g) => ({
        user_id: g.user_id,
        module: g.module as 'projects' | 'business',
        expires_at: g.expires_at as string,
      }));
  }, [grants, now]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = users.filter((u) => {
      if (q) {
        const haystack = `${u.display_name || ''} ${u.email || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filter === 'admin') return u.roles.includes('admin');
      if (filter === 'banned') return isBanned(u);
      if (filter === 'hasProjects' || filter === 'hasBusiness') {
        const a = deriveEffectiveAccess(u.id, subscriptions[u.id], grants);
        const mod = filter === 'hasProjects' ? a.projects : a.business;
        if (!mod.has) return false;
        // Sub-filter iz drill-down konteksta
        if (activeContext?.source === 'billing' && !mod.sources.includes('billing')) return false;
        if (activeContext?.source === 'override' && !mod.sources.includes('override')) return false;
        // PR3: treća dimenzija — reasonCode (samo uz source: 'override')
        if (activeContext?.source === 'override' && activeContext.reasonCode) {
          const moduleKey: 'projects' | 'business' =
            filter === 'hasProjects' ? 'projects' : 'business';
          const hasMatchingReason = grants.some(
            (g) =>
              g.user_id === u.id &&
              g.module === moduleKey &&
              (g.reason_code ?? 'other') === activeContext.reasonCode
          );
          if (!hasMatchingReason) return false;
        }
        return true;
      }
      if (filter === 'overrideActive') {
        return grants.some((g) => g.user_id === u.id);
      }
      if (filter === 'expiringOverride') {
        return grants.some((g) => g.user_id === u.id && isGrantExpiringSoon(g, now));
      }
      if (filter === 'coreOnly') {
        const a = deriveEffectiveAccess(u.id, subscriptions[u.id], grants);
        return !a.projects.has && !a.business.has;
      }
      return true;
    });

    // Sort: kad je expiring chip aktivan → po min(expires_at) ASC
    if (filter === 'expiringOverride') {
      return [...matched].sort((a, b) => {
        const ea = getEarliestUpcomingExpiry(grants, a.id, now)?.getTime() ?? Infinity;
        const eb = getEarliestUpcomingExpiry(grants, b.id, now)?.getTime() ?? Infinity;
        return ea - eb;
      });
    }
    return matched;
  }, [users, search, filter, subscriptions, grants, activeContext, now]);

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t('admin.users.filter.all', 'Svi') },
    { key: 'admin', label: t('admin.users.filter.admins', 'Admini') },
    { key: 'banned', label: t('admin.users.filter.banned', 'Blokirani') },
    { key: 'hasProjects', label: t('admin.users.filter.hasProjects', 'Ima Projects') },
    { key: 'hasBusiness', label: t('admin.users.filter.hasBusiness', 'Ima Business') },
    { key: 'overrideActive', label: t('admin.users.filter.overrideActive', 'Override aktivan') },
    { key: 'expiringOverride', label: t('admin.users.filter.expiringOverride', 'Override ističe < 7d') },
    { key: 'coreOnly', label: t('admin.users.filter.coreOnly', 'Samo Core') },
  ];

  const activeContextLabel = (() => {
    if (!activeContext) return null;
    const { module, source } = activeContext;
    const key =
      module === 'projects'
        ? source === 'billing' ? 'projectsBilling' : source === 'override' ? 'projectsOverride' : 'projects'
        : source === 'billing' ? 'businessBilling' : source === 'override' ? 'businessOverride' : 'business';
    return t(`admin.users.activeContext.${key}`);
  })();

  // PR3: treća dimenzija — reason segment context chipa (samo uz override).
  const activeReasonLabel = (() => {
    if (!activeContext) return null;
    if (activeContext.source !== 'override') return null;
    if (!activeContext.reasonCode) return null;
    return t(grantReasonCodeI18nKey(activeContext.reasonCode));
  })();



  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {filteredUsers.length === users.length
            ? `${users.length} korisnika`
            : `${filteredUsers.length} / ${users.length}`}
        </p>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={usersLoading}>
          {usersLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Osvježi
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('placeholders.searchUsers')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label={t('common.clearSearch')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Drill-down kontekst chip — vizualno odvojen, u zasebnom retku iznad filter chipova */}
      {activeContextLabel && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
          <Filter className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs text-primary/80">
            {t('admin.users.activeContext.fromCardPrefix', 'Iz kartice modula:')}
          </span>
          <span className="text-xs font-semibold text-primary">{activeContextLabel}</span>
          {activeReasonLabel && (
            <>
              <span aria-hidden className="text-xs text-primary/60">·</span>
              <span className="text-xs font-semibold text-primary">{activeReasonLabel}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => { setActiveContext(null); setFilterRaw('all'); }}
            aria-label={t('admin.users.activeContext.reset', 'Resetiraj')}
            className="ml-auto p-1 rounded hover:bg-primary/20 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {filterChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === chip.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {usersLoading && users.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Učitavanje...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('admin.noFilterResults')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => (
            <div key={u.id} className={`bg-card border rounded-xl p-4 space-y-2 ${isBanned(u) ? 'opacity-60 border-destructive/30' : ''}`}>
              <div className="cursor-pointer" onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isBanned(u) ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                      <User className={`w-4 h-4 ${isBanned(u) ? 'text-destructive' : 'text-primary'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{u.display_name || 'Bez imena'}</p>
                        {u.roles.includes('admin') && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary">Admin</Badge>
                        )}
                        {isBanned(u) && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Blokiran</Badge>
                        )}
                        {u.referral_count > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-accent/50">{u.referral_count} pozvan{u.referral_count === 1 ? '' : 'ih'}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {u.email}
                      </p>
                    </div>
                  </div>
                  {u.last_device_info && (
                    <Badge variant="secondary" className="text-xs">
                      <Smartphone className="w-3 h-3 mr-1" />
                      {parseUserAgent(u.last_device_info?.userAgent)}
                    </Badge>
                  )}
                </div>

                {/* Pristup: tekstualni Modul · Izvor badgevi */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {t('admin.users.accessBadge.label', 'Pristup')}:
                  </span>
                  <UserAccessBadges
                    userId={u.id}
                    tier={subscriptions[u.id]}
                    grants={grants}
                    expiringSoonGrants={expiringSoonGrants}
                  />
                </div>

                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(u.created_at), 'dd.MM.yyyy.', { locale: hr })}
                  </span>
                  {(() => {
                    const latestLoginAt = u.last_login_at ?? u.last_sign_in_at;
                    if (!latestLoginAt) return null;
                    return (
                      <span>Zadnja prijava: {format(new Date(latestLoginAt), 'dd.MM. HH:mm', { locale: hr })}</span>
                    );
                  })()}
                  {u.app_version && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                      v{u.app_version}
                    </Badge>
                  )}
                </div>
              </div>

              {expandedUserId === u.id && (
                <div className="pt-2 border-t space-y-3">
                  {/* A. Efektivni pristup (summary) */}
                  <EffectiveAccessSummary
                    userId={u.id}
                    tier={subscriptions[u.id]}
                    grants={grants}
                  />

                  {/* B. Naplata (sloj 1) */}
                  {onSetUserTier && (
                    <UserBillingSection
                      userId={u.id}
                      currentTier={subscriptions[u.id] || 'free'}
                      loading={subLoading === u.id}
                      onChangeTier={(tier) => onSetUserTier(u.id, tier)}
                    />
                  )}

                  {/* C. Admin override modula (sloj 2) */}
                  <UserModuleOverrideSection
                    userId={u.id}
                    onChanged={loadGrants}
                  />

                  <div className="text-xs space-y-1 text-muted-foreground">
                    <p><strong>ID:</strong> <span className="font-mono text-[10px]">{u.id}</span></p>
                    <p><strong>{t('admin.currency')}:</strong> {u.currency || 'EUR'}</p>
                    <p><strong>{t('admin.emailConfirmed')}:</strong> {u.confirmed_at ? format(new Date(u.confirmed_at), 'dd.MM.yyyy. HH:mm', { locale: hr }) : t('common.no')}</p>
                    {u.last_login_at && (
                      <p><strong>{t('admin.lastUsage')}:</strong> {format(new Date(u.last_login_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}</p>
                    )}
                    <p><strong>{t('admin.appVersion')}:</strong> {u.app_version || t('admin.appVersionUnknown')}</p>
                  </div>

                  {u.last_device_info && (() => {
                    const details = parseDetailedUA(u.last_device_info?.userAgent || '');
                    return (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Smartphone className="w-3 h-3" /> Zadnji uređaj:
                        </p>
                        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1.5">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <p><strong>{t('admin.device')}:</strong> {details.device}</p>
                            <p><strong>{t('admin.os')}:</strong> {details.os}</p>
                            <p><strong>{t('admin.browser')}:</strong> {details.browser}</p>
                            <p><strong>{t('admin.language')}:</strong> {u.last_device_info.language || '—'}</p>
                            <p><strong>{t('admin.screen')}:</strong> {u.last_device_info.screenWidth}×{u.last_device_info.screenHeight}</p>
                            <p><strong>{t('admin.viewport')}:</strong> {u.last_device_info.viewportWidth}×{u.last_device_info.viewportHeight}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {u.id !== currentUserId && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {isBanned(u) ? (
                        <Button size="sm" variant="outline" onClick={() => onManageUser('unban', u.id)} disabled={actionLoading === u.id}>
                          {actionLoading === u.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <UserCheck className="w-3.5 h-3.5 mr-1" />}
                          Odblokiraj
                        </Button>
                      ) : (
                        <Button size="sm" variant="destructive" onClick={() => onManageUser('ban', u.id)} disabled={actionLoading === u.id}>
                          {actionLoading === u.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Ban className="w-3.5 h-3.5 mr-1" />}
                          Blokiraj
                        </Button>
                      )}
                      {u.roles.includes('admin') ? (
                        <Button size="sm" variant="outline" onClick={() => onManageUser('remove_role', u.id, 'admin')} disabled={actionLoading === u.id}>
                          <ShieldOff className="w-3.5 h-3.5 mr-1" /> Ukloni admin
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onManageUser('add_role', u.id, 'admin')} disabled={actionLoading === u.id}>
                          <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Dodaj admin
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {hasMoreUsers && filter === 'all' && !search && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={usersLoading}>
                {usersLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Učitaj više
              </Button>
            </div>
          )}
          {hasMoreUsers && (filter !== 'all' || search) && (
            <p className="text-center text-[11px] text-muted-foreground pt-2">
              Filter radi na učitanim korisnicima. Za pretragu svih, isključi filter ili klikni "Učitaj više" bez filtera.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
