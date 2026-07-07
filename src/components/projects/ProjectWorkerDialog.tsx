import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectWorker } from '@/types/projectWorker';
import { useTranslation } from 'react-i18next';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useProjectWorkers } from '@/hooks/useProjectWorkers';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { supabase } from '@/integrations/supabase/client';
import { Link2, Copy, CheckCircle2, Loader2, UserPlus, Mail, X, Users } from 'lucide-react';

interface ProjectWorkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker?: ProjectWorker | null;
  projectId?: string | null;
  onSave: (data: {
    first_name: string;
    last_name: string;
    position: string;
    work_hours: number;
    hourly_rate: number;
    work_start_time: string;
    work_end_time: string;
  }) => void;
}

export const ProjectWorkerDialog = ({
  open,
  onOpenChange,
  worker,
  projectId,
  onSave
}: ProjectWorkerDialogProps) => {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [workHours, setWorkHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [workStartTime, setWorkStartTime] = useState('08:00');
  const [workEndTime, setWorkEndTime] = useState('16:00');
  // V1-B: obavezan "vrijedi od" datum kada se satnica mijenja u edit modu
  const [rateEffectiveFrom, setRateEffectiveFrom] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [rateError, setRateError] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  // Invite state (only for existing workers)
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkedUserName, setLinkedUserName] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);

  // Link-to-existing-member state
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const { generateInviteLink, sendInviteEmail, members } = useProjectMembers(projectId || null);
  const { workers: allWorkers, linkWorkerToMember, setWorkerRate } = useProjectWorkers(projectId || null);

  const isEditing = !!worker;

  // Members not yet linked to any worker on this project (excluding current worker's link)
  const availableMembers = useMemo(() => {
    const linkedUserIds = new Set(
      allWorkers
        .filter((w) => w.user_id && w.id !== worker?.id)
        .map((w) => w.user_id as string)
    );
    return members.filter((m) => m.user_id && !linkedUserIds.has(m.user_id));
  }, [members, allWorkers, worker?.id]);

  useEffect(() => {
    if (worker) {
      setFirstName(worker.first_name);
      setLastName(worker.last_name);
      setPosition(worker.position);
      setWorkHours(worker.work_hours.toString());
      setHourlyRate(worker.hourly_rate.toString());
      setWorkStartTime(worker.work_start_time?.slice(0, 5) || '08:00');
      setWorkEndTime(worker.work_end_time?.slice(0, 5) || '16:00');
    } else {
      setFirstName('');
      setLastName('');
      setPosition('');
      setWorkHours('');
      setHourlyRate('');
      setWorkStartTime('08:00');
      setWorkEndTime('16:00');
    }
    setInviteLink(null);
    setLinkedUserName(null);
    setInviteEmail('');
    setEmailSentTo(null);
    setSelectedMemberId('');
  }, [worker, open]);

  const handleLinkToMember = async () => {
    if (!worker?.id || !selectedMemberId) return;
    setLinking(true);
    try {
      const res = await linkWorkerToMember(worker.id, selectedMemberId);
      if (res.success) {
        setSelectedMemberId('');
        onOpenChange(false);
      }
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!worker?.id) return;
    setUnlinking(true);
    try {
      await linkWorkerToMember(worker.id, null);
    } finally {
      setUnlinking(false);
    }
  };

  // Resolve linked user display name
  useEffect(() => {
    const loadLinkedUser = async () => {
      if (!worker?.user_id) {
        setLinkedUserName(null);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', worker.user_id)
        .maybeSingle();
      setLinkedUserName((data as any)?.display_name || t('common.user', 'Korisnik'));
    };
    loadLinkedUser();
  }, [worker?.user_id, t]);

  const parsedRate = parseFloat(hourlyRate) || 0;
  const rateChanged = isEditing && worker != null && parsedRate !== Number(worker.hourly_rate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim() || !position.trim()) return;

    // V1-B: kad se satnica mijenja u edit modu, route promjenu kroz RPC uz
    // obvezan "vrijedi od" datum. Kolizija s isplaćenim periodom = blokada.
    if (rateChanged && worker) {
      if (!rateEffectiveFrom) {
        setRateError(t('workers.rateEffectiveFromRequired', 'Odaberi datum "vrijedi od"'));
        return;
      }
      setSavingRate(true);
      setRateError(null);
      const res = await setWorkerRate(worker.id, parsedRate, rateEffectiveFrom);
      setSavingRate(false);
      if (!res.success) {
        if (res.error === 'collision' && res.earliestAllowedDate) {
          setRateError(
            t(
              'workers.rateCollisionError',
              'Postoji isplata koja pokriva ovaj period. Najraniji dozvoljeni datum: {{date}}.',
              { date: res.earliestAllowedDate },
            ),
          );
        } else if (res.error === 'not_owner') {
          setRateError(t('projects.access.readOnlyBlockedToast'));
        } else {
          setRateError(t('common.error'));
        }
        return;
      }
    }

    onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      position: position.trim(),
      work_hours: parseFloat(workHours) || 0,
      hourly_rate: parsedRate,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
    });

    onOpenChange(false);
  };

  const handleGenerateInvite = async () => {
    if (!worker?.id) return;
    setGeneratingLink(true);
    try {
      const link = await generateInviteLink('member', 'personal', undefined, worker.id);
      if (link) setInviteLink(link);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    showSuccess(t('projects.linkCopied', 'Link kopiran'));
  };

  const handleSendEmail = async () => {
    if (!worker?.id) return;
    const email = inviteEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError(t('projects.invalidEmail', 'Neispravna email adresa'));
      return;
    }
    setSendingEmail(true);
    try {
      const result = await sendInviteEmail(email, 'member', worker.id, 'personal');
      if (result.success) {
        setEmailSentTo(email);
        showSuccess(
          result.mode === 'email_only'
            ? t('projects.workerEmailSentNew', 'Pozivnica poslana — korisnik će dobiti email s linkom za registraciju')
            : t('projects.workerEmailSent', 'Pozivnica poslana na {{email}}', { email })
        );
      } else {
        const map: Record<string, string> = {
          already_member: t('projects.alreadyMember', 'Korisnik je već član projekta'),
          already_invited: t('projects.alreadyInvited', 'Korisnik već ima aktivnu pozivnicu'),
          invalid_email: t('projects.invalidEmail', 'Neispravna email adresa'),
        };
        showError(map[result.error || ''] || t('common.error'));
      }
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('workers.edit', 'Uredi radnika') : t('workers.add', 'Dodaj radnika')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('workers.firstName', 'Ime')}</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('workers.firstNamePlaceholder', 'Unesite ime')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t('workers.lastName', 'Prezime')}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('workers.lastNamePlaceholder', 'Unesite prezime')}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="position">{t('workers.position', 'Radno mjesto')}</Label>
            <Input
              id="position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder={t('workers.positionPlaceholder', 'npr. Programer, Dizajner...')}
              required
            />
          </div>

          {/* Work schedule */}
          <div className="space-y-2">
            <Label>{t('workers.workSchedule', 'Radno vrijeme')}</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="workStartTime" className="text-xs text-muted-foreground">
                  {t('workers.from', 'Od')}
                </Label>
                <Input
                  id="workStartTime"
                  type="time"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="workEndTime" className="text-xs text-muted-foreground">
                  {t('workers.to', 'Do')}
                </Label>
                <Input
                  id="workEndTime"
                  type="time"
                  value={workEndTime}
                  onChange={(e) => setWorkEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workHours">{t('workers.defaultHours', 'Zadani sati')}</Label>
              <Input
                id="workHours"
                type="number"
                step="0.5"
                min="0"
                value={workHours}
                onChange={(e) => setWorkHours(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">{t('workers.hourlyRate', 'Cijena sata')}</Label>
              <Input
                id="hourlyRate"
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {rateChanged && (
            <div className="space-y-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
              <Label htmlFor="rateEffectiveFrom" className="text-xs font-medium">
                {t('workers.rateEffectiveFromLabel', 'Nova satnica vrijedi od')}
              </Label>
              <Input
                id="rateEffectiveFrom"
                type="date"
                value={rateEffectiveFrom}
                onChange={(e) => { setRateEffectiveFrom(e.target.value); setRateError(null); }}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {t('workers.rateEffectiveFromHint',
                  'Retroaktivna promjena je dopuštena samo do prve isplate koja pokriva period.')}
              </p>
              {rateError && (
                <p className="text-xs text-destructive">{rateError}</p>
              )}
              {savingRate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t('common.loading', 'Učitavanje...')}
                </p>
              )}
            </div>
          )}

          {/* Invite-to-app section — only for existing workers */}
          {isEditing && projectId && (
            <div className="space-y-2 pt-3 border-t">
              <Label className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                {t('projects.inviteWorkerToApp', 'Pozovi u aplikaciju')}
              </Label>

              {worker?.user_id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    <div className="text-sm flex-1 min-w-0">
                      <span className="font-medium">{t('projects.workerLinked', 'Povezan')}: </span>
                      <span className="text-muted-foreground">{linkedUserName || '...'}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={handleUnlink}
                      disabled={unlinking}
                    >
                      {unlinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />}
                      {t('projects.workerUnlink', 'Ukloni vezu')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Link to existing project member */}
                  {availableMembers.length > 0 && (
                    <div className="space-y-2 p-3 rounded-md bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Users className="w-4 h-4 text-primary" />
                        {t('projects.linkToExistingMember', 'Već je član projekta?')}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('projects.linkToExistingMemberHint', 'Poveži ovaj zapis radnika s postojećim članom projekta. Svi njegovi prošli i budući unosi sati će se obračunati.')}
                      </p>
                      <div className="flex gap-2">
                        <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={t('projects.selectMember', 'Odaberi člana...')} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableMembers.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id as string}>
                                {m.display_name || m.user_id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={handleLinkToMember}
                          disabled={!selectedMemberId || linking}
                        >
                          {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : t('projects.linkBtn', 'Poveži')}
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {t('projects.inviteWorkerHint', 'Generiraj link i pošalji ga radniku. Kad ga otvori i prijavi se, automatski se povezuje s ovim zapisom i može unositi svoj dnevnik rada — bez plaćene verzije.')}
                  </p>
                  {!inviteLink ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateInvite}
                      disabled={generatingLink}
                      className="w-full"
                    >
                      {generatingLink ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4 mr-2" />
                      )}
                      {t('projects.generateWorkerLink', 'Generiraj pozivni link')}
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Input value={inviteLink} readOnly className="text-xs" />
                      <Button type="button" variant="outline" size="icon" onClick={handleCopyLink}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {/* Email invite */}
                  <div className="pt-3 mt-3 border-t border-dashed space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t('projects.orSendByEmail', 'Ili pošalji pozivnicu mailom — radi i ako korisnik još nema račun.')}
                    </p>
                    {emailSentTo ? (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        <div className="text-xs">
                          <span className="font-medium">{t('projects.emailSentLabel', 'Poslano')}: </span>
                          <span className="text-muted-foreground break-all">{emailSentTo}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-xs h-7"
                          onClick={() => { setEmailSentTo(null); setInviteEmail(''); }}
                        >
                          {t('projects.sendAnother', 'Pošalji još jedan')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder={t('projects.workerEmailPlaceholder', 'radnik@email.com')}
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          disabled={sendingEmail}
                          className="text-sm"
                        />
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={handleSendEmail}
                          disabled={sendingEmail || !inviteEmail.trim()}
                        >
                          {sendingEmail ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Mail className="w-4 h-4 mr-1" />
                              {t('projects.sendEmail', 'Pošalji')}
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              {isEditing ? t('common.save') : t('common.add')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
