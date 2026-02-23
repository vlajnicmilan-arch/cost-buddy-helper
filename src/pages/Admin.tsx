import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Bug, Monitor, ArrowLeft, RefreshCw } from 'lucide-react';
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
  const { user } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    
    // Check admin role
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
    } else {
      setReports(data || []);
    }
    setLoading(false);
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Bug className="w-5 h-5 text-destructive" />
                Prijave problema
              </h1>
              <p className="text-sm text-muted-foreground">{reports.length} prijava ukupno</p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={loadReports}>
            <RefreshCw className="w-4 h-4" />
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
              <div
                key={report.id}
                className="bg-card border rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div 
                    className="flex-1 cursor-pointer" 
                    onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                  >
                    <h3 className="font-semibold text-sm">{report.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(report.created_at), 'dd. MMM yyyy. HH:mm', { locale: hr })}
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
      </div>
    </div>
  );
};

export default Admin;
