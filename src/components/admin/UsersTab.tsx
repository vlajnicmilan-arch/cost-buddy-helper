import { Loader2, RefreshCw, User, Mail, Clock, Smartphone, Ban, UserCheck, ShieldCheck, ShieldOff } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type AppUser, parseUserAgent, parseDetailedUA, isBanned } from './types';

interface UsersTabProps {
  users: AppUser[];
  usersLoading: boolean;
  hasMoreUsers: boolean;
  usersPage: number;
  expandedUserId: string | null;
  setExpandedUserId: (id: string | null) => void;
  actionLoading: string | null;
  currentUserId?: string;
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
  onRefresh,
  onLoadMore,
  onManageUser,
}: UsersTabProps) => {
  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{users.length} korisnika</p>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={usersLoading}>
          {usersLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Osvježi
        </Button>
      </div>

      {usersLoading && users.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Učitavanje...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
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
