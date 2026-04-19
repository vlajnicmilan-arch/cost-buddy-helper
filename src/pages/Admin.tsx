import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Bug, Monitor, ArrowLeft, RefreshCw, User, Users, Mail, Clock, Smartphone, BarChart3, ShieldCheck, ShieldOff, Ban, UserCheck, Bell, Send, MessageSquareReply, CreditCard, Crown, Briefcase, Star, Activity, Package, BellRing } from 'lucide-react';
import { DiagnosticLogsTab } from '@/components/admin/DiagnosticLogsTab';
import { APKManagerTab } from '@/components/admin/APKManagerTab';
import { PushLogsTab } from '@/components/admin/PushLogsTab';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

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
  referral_count: number;
  app_version: string | null;
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
  total_referrals: number;
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
  const { t } = useTranslation();
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
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [replyMessages, setReplyMessages] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Record<string, string>>({});
  const [subLoading, setSubLoading] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/', { state: { returnTo: '/admin' } });
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

    await Promise.all([loadReports(), loadUsers(), loadBillingSettings(), loadSubscriptions()]);
  };

  const loadBillingSettings = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'billing_enabled')
      .single();
    setBillingEnabled(data?.value === true);
  };

  const toggleBilling = async (enabled: boolean) => {
    setBillingLoading(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'billing_enabled', value: enabled as any, updated_at: new Date().toISOString() });
    if (error) {
      showError('Greška pri spremanju postavke');
    } else {
      setBillingEnabled(enabled);
      showSuccess(enabled ? 'Naplata aktivirana' : 'Naplata deaktivirana');
    }
    setBillingLoading(false);
  };

  const loadSubscriptions = async () => {
    const { data } = await supabase
      .from('user_subscriptions')
      .select('user_id, tier');
    const map: Record<string, string> = {};
    data?.forEach((s: any) => { map[s.user_id] = s.tier; });
    setSubscriptions(map);
  };

  const setUserTier = async (userId: string, tier: string) => {
    setSubLoading(userId);
    const { error } = await supabase
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        tier: tier as any,
        assigned_by: user?.id,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (error) {
      showError('Greška pri postavljanju razine');
    } else {
      setSubscriptions(prev => ({ ...prev, [userId]: tier }));
      showSuccess(`Razina postavljena na ${tier.charAt(0).toUpperCase() + tier.slice(1)}`);
    }
    setSubLoading(null);
  };

  const loadReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      showError(t('toasts.loadBugReportsError'));
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

  const loadUsers = async (page = 1) => {
    setUsersLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-users?page=${page}&perPage=50`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!response.ok) throw new Error('Failed to load users');
      const result = await response.json();
      
      if (page === 1) {
        setUsers(result?.users || []);
      } else {
        setUsers(prev => [...prev, ...(result?.users || [])]);
      }
      setStats(result?.stats || null);
      setHasMoreUsers(result?.pagination?.hasMore ?? false);
      setUsersPage(page);
    } catch (err: any) {
      showError(t('toasts.loadUsersError'));
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
      showError(t('toasts.statusUpdateError'));
    } else {
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
      showSuccess(`Status promijenjen u "${statusLabels[newStatus]}"`);
    }
  };

  const manageUser = async (action: string, userId: string, role?: string) => {
    setActionLoading(userId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: { action, userId, role },
      });
      if (error) throw error;
      showSuccess(data?.message || 'Akcija izvršena');
      await loadUsers();
    } catch (err: any) {
      showError('Greška: ' + (err.message || 'Nepoznata greška'));
    }
    setActionLoading(null);
  };

  const sendBroadcastNotification = async () => {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      showError(t('toasts.enterTitleAndMessage'));
      return;
    }
    setSendingNotif(true);
    try {
      const { data, error } = await supabase.functions.invoke('broadcast-notification', {
        body: { title: notifTitle.trim(), message: notifMessage.trim() },
      });
      if (error) throw error;
      showSuccess(`Obavijest poslana ${data?.count || ''} korisnicima`);
      setNotifTitle('');
      setNotifMessage('');
    } catch (err: any) {
      showError('Greška: ' + (err.message || 'Nepoznata greška'));
    }
    setSendingNotif(false);
  };

  const sendReplyToReporter = async (report: BugReport) => {
    const replyText = replyMessages[report.id]?.trim();
    if (!replyText) {
      showError(t('toasts.enterMessage'));
      return;
    }
    setSendingReply(report.id);
    try {
      const { data, error } = await supabase.functions.invoke('broadcast-notification', {
        body: {
          title: `Odgovor na prijavu: ${report.title}`,
          message: replyText,
          targetUserId: report.user_id,
        },
      });
      if (error) throw error;
      showSuccess(`Poruka poslana korisniku ${report.user_display_name || ''}`);
      setReplyMessages(prev => ({ ...prev, [report.id]: '' }));
    } catch (err: any) {
      showError('Greška: ' + (err.message || 'Nepoznata greška'));
    }
    setSendingReply(null);
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

  const parseDetailedUA = (ua: string) => {
    if (!ua) return { os: 'Nepoznat', browser: 'Nepoznat', device: 'Nepoznat' };
    
    let os = 'Nepoznat';
    if (ua.includes('Android')) {
      const match = ua.match(/Android\s([\d.]+)/);
      os = match ? `Android ${match[1]}` : 'Android';
    } else if (ua.includes('iPhone')) {
      const match = ua.match(/iPhone OS ([\d_]+)/);
      os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
    } else if (ua.includes('iPad')) {
      os = 'iPadOS';
    } else if (ua.includes('Windows NT 10')) {
      os = 'Windows 10/11';
    } else if (ua.includes('Windows')) {
      os = 'Windows';
    } else if (ua.includes('Mac OS X')) {
      const match = ua.match(/Mac OS X ([\d_]+)/);
      os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
    } else if (ua.includes('Linux')) {
      os = 'Linux';
    }

    let browser = 'Nepoznat';
    if (ua.includes('Edg/')) {
      const match = ua.match(/Edg\/([\d.]+)/);
      browser = match ? `Edge ${match[1].split('.')[0]}` : 'Edge';
    } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
      const match = ua.match(/Chrome\/([\d.]+)/);
      browser = match ? `Chrome ${match[1].split('.')[0]}` : 'Chrome';
    } else if (ua.includes('Firefox/')) {
      const match = ua.match(/Firefox\/([\d.]+)/);
      browser = match ? `Firefox ${match[1].split('.')[0]}` : 'Firefox';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      const match = ua.match(/Version\/([\d.]+)/);
      browser = match ? `Safari ${match[1].split('.')[0]}` : 'Safari';
    }

    let device = 'Desktop';
    if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobitel';
    if (ua.includes('iPad') || ua.includes('Tablet')) device = 'Tablet';

    return { os, browser, device };
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Nemate pristup ovoj stranici.</p>
        <Button variant="outline" onClick={() => navigate('/home')}>
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
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto p-4 pb-24 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/home')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-bold">Admin</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-8 h-9">
            <TabsTrigger value="stats" className="text-xs gap-1 px-1">
              <BarChart3 className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Statistika</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs gap-1 px-1">
              <Users className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Korisnici</span>
              <span className="sm:hidden">Users</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="text-xs gap-1 px-1">
              <CreditCard className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Pretplate</span>
              <span className="sm:hidden">Sub</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="text-xs gap-1 px-1">
              <Bug className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Prijave</span>
              <span className="sm:hidden">Bug</span>
            </TabsTrigger>
            <TabsTrigger value="notify" className="text-xs gap-1 px-1">
              <Bell className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Obavijesti</span>
              <span className="sm:hidden">Slanje</span>
            </TabsTrigger>
            <TabsTrigger value="pushlogs" className="text-xs gap-1 px-1">
              <BellRing className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Push log</span>
              <span className="sm:hidden">Push</span>
            </TabsTrigger>
            <TabsTrigger value="apk" className="text-xs gap-1 px-1">
              <Package className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">APK</span>
              <span className="sm:hidden">APK</span>
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="text-xs gap-1 px-1">
              <Activity className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Dijagnostika</span>
              <span className="sm:hidden">Diag</span>
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
                  <StatCard label="Pozivnice" value={stats.total_referrals} />
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => loadUsers(1)} disabled={usersLoading}>
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
              <Button variant="outline" size="sm" onClick={() => loadUsers(1)} disabled={usersLoading}>
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
                {hasMoreUsers && (
                  <div className="text-center pt-2">
                    <Button variant="outline" size="sm" onClick={() => loadUsers(usersPage + 1)} disabled={usersLoading}>
                      {usersLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                      Učitaj više
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* BILLING TAB */}
          <TabsContent value="billing" className="space-y-4 mt-4">
            {/* Global billing toggle */}
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm">Globalna naplata</h3>
                    <p className="text-xs text-muted-foreground">Uključi/isključi sustav pretplata za sve korisnike</p>
                  </div>
                </div>
                <Switch
                  checked={billingEnabled}
                  onCheckedChange={toggleBilling}
                  disabled={billingLoading}
                />
              </div>
              <div className={`text-xs px-3 py-2 rounded-lg ${billingEnabled ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                {billingEnabled ? '✓ Naplata je aktivna — korisnici vide ograničenja prema razini' : '○ Naplata je isključena — svi korisnici imaju puni pristup'}
              </div>
            </div>

            {/* User tier management */}
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Razine korisnika</h3>
              </div>

              {users.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Učitajte korisnike na tabu "Korisnici"</p>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => {
                    const currentTier = subscriptions[u.id] || 'free';
                    const tierIcon = currentTier === 'business' ? Briefcase : currentTier === 'pro' ? Star : User;
                    const TierIcon = tierIcon;
                    return (
                      <div key={u.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <TierIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.display_name || u.email}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                        <Select
                          value={currentTier}
                          onValueChange={(val) => setUserTier(u.id, val)}
                          disabled={subLoading === u.id}
                        >
                          <SelectTrigger className="w-[110px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Stripe integracija još nije aktivna. Razine se trenutno dodjeljuju ručno.
            </p>
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

                        {/* Reply to reporter */}
                        <div className="pt-2 border-t">
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                            <MessageSquareReply className="w-3 h-3" /> Pošalji poruku korisniku:
                          </p>
                          <div className="flex gap-2">
                            <Input
                              placeholder={`Poruka za ${report.user_display_name || 'korisnika'}...`}
                              value={replyMessages[report.id] || ''}
                              onChange={(e) => setReplyMessages(prev => ({ ...prev, [report.id]: e.target.value }))}
                              className="text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  sendReplyToReporter(report);
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              onClick={() => sendReplyToReporter(report)}
                              disabled={sendingReply === report.id || !replyMessages[report.id]?.trim()}
                            >
                              {sendingReply === report.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* NOTIFY TAB */}
          <TabsContent value="notify" className="space-y-4 mt-4">
            <div className="bg-card border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Pošalji obavijest svim korisnicima</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Naslov</label>
                  <Input
                    placeholder={t('placeholders.notificationTitle')}
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Poruka</label>
                  <Textarea
                    placeholder="Unesite tekst obavijesti..."
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    rows={4}
                  />
                </div>
                <Button
                  onClick={sendBroadcastNotification}
                  disabled={sendingNotif || !notifTitle.trim() || !notifMessage.trim()}
                  className="w-full"
                >
                  {sendingNotif ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Pošalji obavijest
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Obavijest će biti poslana svim registriranim korisnicima i pojavit će se u njihovim push obavijestima.
            </p>
          </TabsContent>

          {/* PUSH LOGS TAB */}
          <TabsContent value="pushlogs" className="space-y-3 mt-4">
            <PushLogsTab />
          </TabsContent>

          {/* APK TAB */}
          <TabsContent value="apk" className="space-y-3 mt-4">
            <APKManagerTab />
          </TabsContent>

          {/* DIAGNOSTICS TAB */}
          <TabsContent value="diagnostics" className="space-y-3 mt-4">
            <DiagnosticLogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
