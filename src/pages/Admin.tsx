import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Bug, Monitor, ArrowLeft, RefreshCw, User, Users, Mail, Clock, Smartphone, BarChart3, ShieldCheck, ShieldOff, Ban, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';

interface BugReport {
  id: string;
  user_id: string;
  title: string;
  description: string;
  device_info: any;
  status: string;
  created_at: string;
  user_display_name?: string;
}

interface AppUser {
  id: string;
  email: string;
  display_name: string | null;
  currency: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed_at: string | null;
  banned_until: string | null;
  roles: string[];
  last_device_info: any;
  last_login_at: string | null;
}

interface Stats {
  total_users: number;
  active_users_7d: number;
  active_users_30d: number;
  total_expenses: number;
  expenses_7d: number;
  total_projects: number;
  total_budgets: number;
  total_savings: number;
  open_bug_reports: number;
}

const statusColors: Record<string, string> = {
  open: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  in_progress: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  resolved: 'bg-green-500/15 text-green-700 dark:text-green-400',
  closed: 'bg-muted text-muted-foreground',
};

const statusLabels: Record<string, string> = {
  open: 'Otvoreno',
  in_progress: 'U tijeku',
  resolved: 'Riješeno',
  closed: 'Zatvoreno',
};

const Admin = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('stats');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth', { state: { returnTo: '/admin' } });
      return;
    }
    checkAdminAndLoad();
  }, [user, authLoading]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const admin = roles?.some((r: any) => r.role === 'admin') ?? false;
    setIsAdmin(admin);

    if (!admin) {
      setLoading(false);
      return;
    }

    await Promise.all([loadReports(), loadUsers()]);
  };

  const loadReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Greška pri učitavanju prijava');
      setLoading(false);
      return;
    }

    const userIds = [...new Set((data || []).map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

    setReports((data || []).map(r => ({
      ...r,
      user_display_name: profileMap.get(r.user_id) || undefined,
    })));
    setLoading(false);
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-users');
      if (error) throw error;
      setUsers(data?.users || []);
      setStats(data?.stats || null);
    } catch (err: any) {
      toast.error('Greška pri učitavanju korisnika');
      console.error(err);
    }
    setUsersLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('bug_reports')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast.error('Greška pri ažuriranju statusa');
    } else {
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
      toast.success(`Status promijenjen u "${statusLabels[newStatus]}"`);
    }
  };

  const manageUser = async (action: string, userId: string, role?: string) => {
    setActionLoading(userId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: { action, userId, role },
      });
      if (error) throw error;
      toast.success(data?.message || 'Akcija izvršena');
      await loadUsers();
    } catch (err: any) {
      toast.error('Greška: ' + (err.message || 'Nepoznata greška'));
    }
    setActionLoading(null);
  };

  const parseUserAgent = (ua: string) => {
    if (!ua) return 'Nepoznat';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Ostalo';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Nemate pristup ovoj stranici.</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Natrag
        </Button>
      </div>
    );
  }

  const StatCard = ({ label, value, sub }: { label: string; value: number | string; sub?: string }) => (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );

  const isBanned = (u: AppUser) => {
    if (!u.banned_until) return false;
    return new Date(u.banned_until) > new Date();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Admin panel</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="stats" className="flex-1 gap-1">
              <BarChart3 className="w-3.5 h-3.5" />
              Statistika
            </TabsTrigger>
            <TabsTrigger value="users" className="flex-1 gap-1">
              <Users className="w-3.5 h-3.5" />
              Korisnici
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex-1 gap-1">
              <Bug className="w-3.5 h-3.5" />
              Prijave
            </TabsTrigger>
          </TabsList>

          {/* STATS TAB */}
          <TabsContent value="stats" className="space-y-4 mt-4">
            {usersLoading && !stats ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              </div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Ukupno korisnika" value={stats.total_users} />
                  <StatCard label="Aktivni (7 dana)" value={stats.active_users_7d} sub={`${stats.active_users_30d} u zadnjih 30 dana`} />
                  <StatCard label="Ukupno transakcija" value={stats.total_expenses} sub={`${stats.expenses_7d} u zadnjih 7 dana`} />
                  <StatCard label="Otvorene prijave" value={stats.open_bug_reports} />
                  <StatCard label="Projekti" value={stats.total_projects} />
                  <StatCard label="Budžeti" value={stats.total_budgets} />
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={loadUsers} disabled={usersLoading}>
                    {usersLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Osvježi
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nema podataka</p>
            )}
          </TabsContent>

          {/* USERS TAB */}
          <TabsContent value="users" className="space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{users.length} korisnika</p>
              <Button variant="outline" size="sm" onClick={loadUsers} disabled={usersLoading}>
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
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(u.created_at), 'dd.MM.yyyy.', { locale: hr })}
                        </span>
                        {u.last_sign_in_at && (
                          <span>Zadnja prijava: {format(new Date(u.last_sign_in_at), 'dd.MM. HH:mm', { locale: hr })}</span>
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
                            <p><strong>Zadnji login (tracked):</strong> {format(new Date(u.last_login_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}</p>
                          )}
                        </div>

                        {u.last_device_info && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                              <Smartphone className="w-3 h-3" /> Zadnji uređaj:
                            </p>
                            <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/50 rounded-lg p-2">
                              <p>Ekran: {u.last_device_info.screenWidth}×{u.last_device_info.screenHeight}</p>
                              <p>Viewport: {u.last_device_info.viewportWidth}×{u.last_device_info.viewportHeight}</p>
                              <p className="break-all">UA: {u.last_device_info.userAgent}</p>
                            </div>
                          </div>
                        )}

                        {/* Admin actions */}
                        {u.id !== user?.id && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {isBanned(u) ? (
                              <Button size="sm" variant="outline" onClick={() => manageUser('unban', u.id)} disabled={actionLoading === u.id}>
                                {actionLoading === u.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <UserCheck className="w-3.5 h-3.5 mr-1" />}
                                Odblokiraj
                              </Button>
                            ) : (
                              <Button size="sm" variant="destructive" onClick={() => manageUser('ban', u.id)} disabled={actionLoading === u.id}>
                                {actionLoading === u.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Ban className="w-3.5 h-3.5 mr-1" />}
                                Blokiraj
                              </Button>
                            )}
                            {u.roles.includes('admin') ? (
                              <Button size="sm" variant="outline" onClick={() => manageUser('remove_role', u.id, 'admin')} disabled={actionLoading === u.id}>
                                <ShieldOff className="w-3.5 h-3.5 mr-1" /> Ukloni admin
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => manageUser('add_role', u.id, 'admin')} disabled={actionLoading === u.id}>
                                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Dodaj admin
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* REPORTS TAB */}
          <TabsContent value="reports" className="space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{reports.length} prijava</p>
              <Button variant="outline" size="sm" onClick={loadReports}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Osvježi
              </Button>
            </div>

            {reports.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bug className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nema prijavljenih problema</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.id} className="bg-card border rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                        <h3 className="font-semibold text-sm">{report.title}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {report.user_display_name || 'Nepoznat korisnik'} · {format(new Date(report.created_at), 'dd. MMM yyyy. HH:mm', { locale: hr })}
                        </p>
                      </div>
                      <Badge className={statusColors[report.status] || statusColors.open} variant="secondary">
                        {statusLabels[report.status] || report.status}
                      </Badge>
                    </div>

                    {expandedId === report.id && (
                      <div className="space-y-3 pt-2 border-t">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Opis:</p>
                          <p className="text-sm whitespace-pre-wrap">{report.description}</p>
                        </div>
                        {report.device_info && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                              <Monitor className="w-3 h-3" /> Uređaj:
                            </p>
                            <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/50 rounded-lg p-2">
                              <p>Ekran: {report.device_info.screenWidth}×{report.device_info.screenHeight}</p>
                              <p>Viewport: {report.device_info.viewportWidth}×{report.device_info.viewportHeight}</p>
                              <p>Verzija: {report.device_info.appVersion}</p>
                              <p>Pohrana: {report.device_info.storageMode}</p>
                              <p className="break-all">UA: {report.device_info.userAgent}</p>
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Promijeni status:</p>
                          <Select value={report.status} onValueChange={(val) => updateStatus(report.id, val)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Otvoreno</SelectItem>
                              <SelectItem value="in_progress">U tijeku</SelectItem>
                              <SelectItem value="resolved">Riješeno</SelectItem>
                              <SelectItem value="closed">Zatvoreno</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
