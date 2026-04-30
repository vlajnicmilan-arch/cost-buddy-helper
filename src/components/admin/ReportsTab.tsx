import { Loader2, RefreshCw, Bug, User, Monitor, MessageSquareReply, Send } from 'lucide-react';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type BugReport, statusColors, statusLabels } from './types';

interface ReportsTabProps {
  reports: BugReport[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  replyMessages: Record<string, string>;
  setReplyMessages: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  sendingReply: string | null;
  onRefresh: () => void;
  onUpdateStatus: (id: string, newStatus: string) => void;
  onSendReply: (report: BugReport) => void;
}

export const ReportsTab = ({
  reports,
  expandedId,
  setExpandedId,
  replyMessages,
  setReplyMessages,
  sendingReply,
  onRefresh,
  onUpdateStatus,
  onSendReply,
}: ReportsTabProps) => {
  return (
    <div className="space-y-3 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{reports.length} prijava</p>
        <Button variant="outline" size="sm" onClick={onRefresh}>
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
                    <Select value={report.status} onValueChange={(val) => onUpdateStatus(report.id, val)}>
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
                            onSendReply(report);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => onSendReply(report)}
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
    </div>
  );
};
