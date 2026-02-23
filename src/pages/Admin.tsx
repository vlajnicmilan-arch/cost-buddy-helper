import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Bug, Monitor, ArrowLeft, RefreshCw, User, Users, Mail, Clock, Smartphone } from 'lucide-react';
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
  last_device_info: any;
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
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('reports');

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

    await loadReports();
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
      setUsers(data || []);
    } catch (err: any) {
      toast.error('Greška pri učitavanju korisnika');
      console.error(err);
    }
    setUsersLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0 && isAdmin) {
      loadUsers();
    }
  }, [activeTab, isAdmin]);

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
            <TabsTrigger value="reports" className="flex-1 gap-1.5">
              <Bug className="w-4 h-4" />
              Prijave ({reports.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="flex-1 gap-1.5">
              <Users className="w-4 h-4" />
              Korisnici {users.length > 0 && `(${users.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-3 mt-4">
            <div className="flex justify-end">
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

          <TabsContent value="users" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={loadUsers} disabled={usersLoading}>
                {usersLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Osvježi
              </Button>
            </div>

            {usersLoading && users.length === 0 ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Učitavanje korisnika...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nema korisnika</p>
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div key={u.id} className="bg-card border rounded-xl p-4 space-y-2">
                    <div
                      className="cursor-pointer"
                      onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{u.display_name || 'Bez imena'}</p>
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
                          Registriran: {format(new Date(u.created_at), 'dd.MM.yyyy.', { locale: hr })}
                        </span>
                        {u.last_sign_in_at && (
                          <span>
                            Zadnja prijava: {format(new Date(u.last_sign_in_at), 'dd.MM.yyyy. HH:mm', { locale: hr })}
                          </span>
                        )}
                      </div>
                    </div>

                    {expandedUserId === u.id && (
                      <div className="pt-2 border-t space-y-2">
                        <div className="text-xs space-y-1 text-muted-foreground">
                          <p><strong>ID:</strong> <span className="font-mono text-[10px]">{u.id}</span></p>
                          <p><strong>Valuta:</strong> {u.currency || 'EUR'}</p>
                          <p><strong>Email potvrđen:</strong> {u.confirmed_at ? format(new Date(u.confirmed_at), 'dd.MM.yyyy. HH:mm', { locale: hr }) : 'Ne'}</p>
                        </div>
                        {u.last_device_info && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                              <Smartphone className="w-3 h-3" /> Zadnji uređaj:
                            </p>
                            <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/50 rounded-lg p-2">
                              <p>Ekran: {u.last_device_info.screenWidth}×{u.last_device_info.screenHeight}</p>
                              <p>Viewport: {u.last_device_info.viewportWidth}×{u.last_device_info.viewportHeight}</p>
                              {u.last_device_info.appVersion && <p>Verzija: {u.last_device_info.appVersion}</p>}
                              {u.last_device_info.storageMode && <p>Pohrana: {u.last_device_info.storageMode}</p>}
                              <p className="break-all">UA: {u.last_device_info.userAgent}</p>
                            </div>
                          </div>
                        )}
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
