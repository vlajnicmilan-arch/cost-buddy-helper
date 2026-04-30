import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Bug, ArrowLeft, Users, BarChart3, Bell, CreditCard,
  MessageSquareReply, Activity, Package, BellRing, Heart,
} from 'lucide-react';
import { DiagnosticLogsTab } from '@/components/admin/DiagnosticLogsTab';
import { APKManagerTab } from '@/components/admin/APKManagerTab';
import { PushLogsTab } from '@/components/admin/PushLogsTab';
import { PulseTab } from '@/components/admin/PulseTab';
import { FeedbackInboxTab } from '@/components/admin/FeedbackInboxTab';
import { StatsTab } from '@/components/admin/StatsTab';
import { UsersTab } from '@/components/admin/UsersTab';
import { BillingTab } from '@/components/admin/BillingTab';
import { ReportsTab } from '@/components/admin/ReportsTab';
import { NotifyTab } from '@/components/admin/NotifyTab';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import { friendlyError } from '@/lib/errorMessages';
import { type AppUser, type AdminStats, type BugReport, statusLabels } from '@/components/admin/types';

const Admin = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'stats';
    const t = new URLSearchParams(window.location.search).get('tab');
    return t || 'stats';
  });
  const tabsListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = tabsListRef.current;
    if (!list) return;
    const activeEl = list.querySelector<HTMLElement>(`[data-state="active"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      showError(t('errors.save.setting', 'Greška pri spremanju postavke'));
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
      showError(t('errors.level.setFailed', 'Greška pri postavljanju razine'));
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
      showError(friendlyError(err));
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
      showError(friendlyError(err));
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
      showError(friendlyError(err));
    }
    setSendingReply(null);
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

  const tabBtnClass = "flex-shrink-0 min-w-[72px] h-14 flex flex-col items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-medium leading-tight";

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto p-4 pb-24 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/home')} aria-label={t('common.back')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-bold">Admin</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="sticky top-0 z-10 -mx-4 px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <TabsList
              ref={tabsListRef}
              className="w-full h-auto flex items-stretch justify-start gap-1 overflow-x-auto overflow-y-hidden p-1 rounded-md [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              <TabsTrigger value="pulse" className={tabBtnClass}>
                <Heart className="w-4 h-4 shrink-0" /><span>Pulse</span>
              </TabsTrigger>
              <TabsTrigger value="stats" className={tabBtnClass}>
                <BarChart3 className="w-4 h-4 shrink-0" /><span>Statistika</span>
              </TabsTrigger>

              <div className="w-px self-stretch bg-border/60 mx-1 flex-shrink-0" aria-hidden="true" />

              <TabsTrigger value="users" className={tabBtnClass}>
                <Users className="w-4 h-4 shrink-0" /><span>Korisnici</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className={tabBtnClass}>
                <CreditCard className="w-4 h-4 shrink-0" /><span>Pretplate</span>
              </TabsTrigger>
              <TabsTrigger value="reports" className={tabBtnClass}>
                <Bug className="w-4 h-4 shrink-0" /><span>Prijave</span>
              </TabsTrigger>
              <TabsTrigger value="feedback" className={tabBtnClass}>
                <MessageSquareReply className="w-4 h-4 shrink-0" /><span>Feedback</span>
              </TabsTrigger>

              <div className="w-px self-stretch bg-border/60 mx-1 flex-shrink-0" aria-hidden="true" />

              <TabsTrigger value="notify" className={tabBtnClass}>
                <Bell className="w-4 h-4 shrink-0" /><span>Obavijesti</span>
              </TabsTrigger>
              <TabsTrigger value="pushlogs" className={tabBtnClass}>
                <BellRing className="w-4 h-4 shrink-0" /><span>Push log</span>
              </TabsTrigger>

              <div className="w-px self-stretch bg-border/60 mx-1 flex-shrink-0" aria-hidden="true" />

              <TabsTrigger value="apk" className={tabBtnClass}>
                <Package className="w-4 h-4 shrink-0" /><span>APK</span>
              </TabsTrigger>
              <TabsTrigger value="diagnostics" className={tabBtnClass}>
                <Activity className="w-4 h-4 shrink-0" /><span>Dijagnostika</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="stats" className="space-y-4 mt-4">
            <StatsTab stats={stats} loading={usersLoading} onRefresh={() => loadUsers(1)} />
          </TabsContent>

          <TabsContent value="users">
            <UsersTab
              users={users}
              usersLoading={usersLoading}
              hasMoreUsers={hasMoreUsers}
              usersPage={usersPage}
              expandedUserId={expandedUserId}
              setExpandedUserId={setExpandedUserId}
              actionLoading={actionLoading}
              currentUserId={user?.id}
              subscriptions={subscriptions}
              onRefresh={() => loadUsers(1)}
              onLoadMore={() => loadUsers(usersPage + 1)}
              onManageUser={manageUser}
            />
          </TabsContent>

          <TabsContent value="billing">
            <BillingTab
              billingEnabled={billingEnabled}
              billingLoading={billingLoading}
              onToggleBilling={toggleBilling}
              users={users}
              subscriptions={subscriptions}
              subLoading={subLoading}
              onSetUserTier={setUserTier}
            />
          </TabsContent>

          <TabsContent value="reports">
            <ReportsTab
              reports={reports}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              replyMessages={replyMessages}
              setReplyMessages={setReplyMessages}
              sendingReply={sendingReply}
              onRefresh={loadReports}
              onUpdateStatus={updateStatus}
              onSendReply={sendReplyToReporter}
            />
          </TabsContent>

          <TabsContent value="notify">
            <NotifyTab
              notifTitle={notifTitle}
              setNotifTitle={setNotifTitle}
              notifMessage={notifMessage}
              setNotifMessage={setNotifMessage}
              sendingNotif={sendingNotif}
              onSend={sendBroadcastNotification}
            />
          </TabsContent>

          <TabsContent value="pushlogs" className="space-y-3 mt-4">
            <PushLogsTab />
          </TabsContent>

          <TabsContent value="apk" className="space-y-3 mt-4">
            <APKManagerTab />
          </TabsContent>

          <TabsContent value="diagnostics" className="space-y-3 mt-4">
            <DiagnosticLogsTab />
          </TabsContent>

          <TabsContent value="pulse" className="space-y-3 mt-4">
            <PulseTab />
          </TabsContent>

          <TabsContent value="feedback" className="space-y-3 mt-4">
            <FeedbackInboxTab initialId={new URLSearchParams(window.location.search).get('id')} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
