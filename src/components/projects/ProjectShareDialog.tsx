import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useProjectShareLinks } from '@/hooks/useProjectShareLinks';
import { Copy, Trash2, Eye, Link2, Loader2, ExternalLink } from 'lucide-react';
import { showSuccess } from '@/hooks/useStatusFeedback';
import { format } from 'date-fns';
import { hr } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface ProjectShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export const ProjectShareDialog = ({ open, onOpenChange, projectId, projectName }: ProjectShareDialogProps) => {
  const { t } = useTranslation();
  const { links, loading, create, revoke, remove, update } = useProjectShareLinks(projectId);
  const [creating, setCreating] = useState(false);
  const [showFinancials, setShowFinancials] = useState(false);
  const [showPhotos, setShowPhotos] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState('30');

  const handleCreate = async () => {
    setCreating(true);
    const expires_at = expiresInDays
      ? new Date(Date.now() + parseInt(expiresInDays) * 86400000).toISOString()
      : null;
    await create({ show_financials: showFinancials, show_photos: showPhotos, show_milestones: showMilestones, expires_at });
    setCreating(false);
  };

  const buildUrl = (token: string) => `${window.location.origin}/p/${token}`;

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(buildUrl(token));
    showSuccess(t('common.copied', 'Kopirano'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            {t('projects.share.title', 'Podijeli s klijentom')}
          </DialogTitle>
          <DialogDescription>
            {t('projects.share.description', 'Generiraj link koji klijent može otvoriti bez prijave. Vidi samo što ti odabereš.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new link form */}
          <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
            <p className="text-sm font-medium">{t('projects.share.newLink', 'Novi link')}</p>

            <div className="flex items-center justify-between">
              <Label htmlFor="ms" className="text-sm cursor-pointer">{t('projects.share.showMilestones', 'Prikaži faze')}</Label>
              <Switch id="ms" checked={showMilestones} onCheckedChange={setShowMilestones} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ph" className="text-sm cursor-pointer">{t('projects.share.showPhotos', 'Prikaži foto dnevnik')}</Label>
              <Switch id="ph" checked={showPhotos} onCheckedChange={setShowPhotos} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="fin" className="text-sm cursor-pointer">{t('projects.share.showFinancials', 'Prikaži financije')}</Label>
              <Switch id="fin" checked={showFinancials} onCheckedChange={setShowFinancials} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="exp" className="text-xs text-muted-foreground">
                {t('projects.share.expiresInDays', 'Vrijedi (dana, prazno = bez isteka)')}
              </Label>
              <Input
                id="exp"
                type="number"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                min="0"
                placeholder="30"
                className="h-8"
              />
            </div>

            <Button onClick={handleCreate} disabled={creating} className="w-full h-9">
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('projects.share.generate', 'Generiraj link')}
            </Button>
          </div>

          {/* Existing links */}
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : links.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-2">{t('projects.share.noLinks', 'Još nema kreiranih linkova')}</p>
          ) : (
            <div className="space-y-2">
              {links.map(link => {
                const expired = link.expires_at && new Date(link.expires_at) < new Date();
                const inactive = Boolean(expired) || Boolean(link.revoked_at);
                return (
                  <div key={link.id} className="p-2.5 rounded-md border bg-card text-sm space-y-1.5">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2 py-1 bg-muted rounded text-[11px] truncate font-mono">
                        {buildUrl(link.token)}
                      </code>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(link.token)} disabled={inactive}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(buildUrl(link.token), '_blank')} disabled={inactive}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(link.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {link.revoked_at && <Badge variant="destructive" className="text-[10px] h-4 px-1">{t('projects.share.revoked', 'Opozvan')}</Badge>}
                      {expired && !link.revoked_at && <Badge variant="destructive" className="text-[10px] h-4 px-1">{t('projects.share.expired', 'Istekao')}</Badge>}
                      {!!link.show_financials && <Badge variant="outline" className="text-[10px] h-4 px-1">{t('projects.share.fin', 'Fin.')}</Badge>}
                      {!!link.show_photos && <Badge variant="outline" className="text-[10px] h-4 px-1">{t('projects.share.ph', 'Foto')}</Badge>}
                      {!!link.show_milestones && <Badge variant="outline" className="text-[10px] h-4 px-1">{t('projects.share.ms', 'Faze')}</Badge>}
                      <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {link.view_count}
                      </span>
                      {link.expires_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {t('projects.share.until', 'do')} {format(new Date(link.expires_at), 'd.M.yyyy', { locale: hr })}
                        </span>
                      )}
                    </div>
                    {!link.revoked_at && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => revoke(link.id)}>
                        {t('projects.share.revokeAction', 'Opozovi')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
