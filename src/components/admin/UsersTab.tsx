import { useState, useMemo } from 'react';
import { Loader2, RefreshCw, User, Mail, Clock, Smartphone, Ban, UserCheck, ShieldCheck, ShieldOff, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { type AppUser, parseUserAgent, parseDetailedUA, isBanned } from './types';

type FilterKey = 'all' | 'admin' | 'banned' | 'pro' | 'business' | 'free';

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
  onRefresh: () => void;
  onLoadMore: () => void;
  onManageUser: (action: string, userId: string, role?: string) => void;
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
  onRefresh,
  onLoadMore,
  onManageUser,
}: UsersTabProps) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      // Text search
      if (q) {
        const haystack = `${u.display_name || ''} ${u.email || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Filter chip
      if (filter === 'admin') return u.roles.includes('admin');
      if (filter === 'banned') return isBanned(u);
      if (filter === 'pro') return (subscriptions[u.id] || 'free') === 'pro';
      if (filter === 'business') return (subscriptions[u.id] || 'free') === 'business';
      if (filter === 'free') return !subscriptions[u.id] || subscriptions[u.id] === 'free';
      return true;
    });
  }, [users, search, filter, subscriptions]);

  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Svi' },
    { key: 'admin', label: 'Admini' },
    { key: 'banned', label: 'Blokirani' },
    { key: 'business', label: 'Business' },
    { key: 'pro', label: 'Pro' },
    { key: 'free', label: 'Free' },
  ];

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
          placeholder="Pretraži po imenu ili emailu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label="Očisti pretragu"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
          <p className="text-sm">Nema rezultata za zadane filtere</p>
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
                      <div className="flex items-center gap-2">
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
                  <div className="text-xs space-y-1 text-muted-foreground">
                    <p><strong>ID:</strong> <span className="font-mono text-[10px]">{u.id}</span></p>
                    <p><strong>Valuta:</strong> {u.currency || 'EUR'}</p>
                    <p><strong>Email potvrđen:</strong> {u.confirmed_at ? format(new Date(u.confirmed_at), 'dd.MM.yyyy. HH:mm', { locale: hr }) : 'Ne'}</p>
                    {u.last_login_at && (
                      <p><strong>Zadnje korištenje:</strong> {format(new Date(u.last_login_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}</p>
                    )}
                    <p><strong>Verzija aplikacije:</strong> {u.app_version || 'Nepoznato (starija verzija)'}</p>
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
                            <p><strong>Uređaj:</strong> {details.device}</p>
                            <p><strong>OS:</strong> {details.os}</p>
                            <p><strong>Browser:</strong> {details.browser}</p>
                            <p><strong>Jezik:</strong> {u.last_device_info.language || '—'}</p>
                            <p><strong>Ekran:</strong> {u.last_device_info.screenWidth}×{u.last_device_info.screenHeight}</p>
                            <p><strong>Viewport:</strong> {u.last_device_info.viewportWidth}×{u.last_device_info.viewportHeight}</p>
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
          {hasMoreUsers && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={usersLoading}>
                {usersLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Učitaj više
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
