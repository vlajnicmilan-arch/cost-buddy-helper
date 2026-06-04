import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, FolderKanban, Building2 } from 'lucide-react';
import { GrantModule } from '@/hooks/useMyActiveModuleGrants';
import { GrantReasonCode } from '@/hooks/useAdminModuleGrants';

interface Props {
  busy: boolean;
  onSubmit: (params: {
    modules: GrantModule[];
    expires_at: string | null;
    reason_code: GrantReasonCode;
    reason_note: string;
  }) => Promise<void>;
}

type DurationKey = '7d' | '30d' | '90d' | '365d' | 'permanent' | 'custom';

const REASON_CODES: GrantReasonCode[] = [
  'refund',
  'beta_tester',
  'internal',
  'partner',
  'support',
  'other',
];

const REASON_KEY: Record<GrantReasonCode, string> = {
  refund: 'admin.moduleAccess.reasonCode.refund',
  beta_tester: 'admin.moduleAccess.reasonCode.beta_tester',
  internal: 'admin.moduleAccess.reasonCode.internal',
  partner: 'admin.moduleAccess.reasonCode.partner',
  support: 'admin.moduleAccess.reasonCode.support',
  other: 'admin.moduleAccess.reasonCode.other',
};

function computeExpiresAt(d: DurationKey, customIso: string): string | null {
  if (d === 'permanent') return null;
  if (d === 'custom') return customIso || null;
  const days = d === '7d' ? 7 : d === '30d' ? 30 : d === '90d' ? 90 : 365;
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

export const AdminModuleGrantForm = ({ busy, onSubmit }: Props) => {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(false);
  const [business, setBusiness] = useState(false);
  const [duration, setDuration] = useState<DurationKey>('30d');
  const [customDate, setCustomDate] = useState('');
  const [reasonCode, setReasonCode] = useState<GrantReasonCode>('support');
  const [reasonNote, setReasonNote] = useState('');

  const selectedModules: GrantModule[] = [
    ...(projects ? (['projects'] as const) : []),
    ...(business ? (['business'] as const) : []),
  ];

  const customIso = customDate ? new Date(customDate).toISOString() : '';
  const customInvalid =
    duration === 'custom' &&
    (!customIso || new Date(customIso).getTime() <= Date.now());

  const noteRequired = reasonCode === 'other';
  const noteInvalid = noteRequired && reasonNote.trim().length === 0;

  const canSubmit =
    !busy &&
    selectedModules.length > 0 &&
    !customInvalid &&
    !noteInvalid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({
      modules: selectedModules,
      expires_at: computeExpiresAt(duration, customIso),
      reason_code: reasonCode,
      reason_note: reasonNote.trim(),
    });
    // reset on success
    setProjects(false);
    setBusiness(false);
    setReasonNote('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('admin.moduleAccess.form.modules', 'Moduli')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-muted/40">
            <Checkbox checked={projects} onCheckedChange={(v) => setProjects(!!v)} />
            <FolderKanban className="w-4 h-4 text-primary" />
            <span className="text-sm">
              {t('settings.modules.projects.title', 'Projekti')}
            </span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-muted/40">
            <Checkbox checked={business} onCheckedChange={(v) => setBusiness(!!v)} />
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-sm">
              {t('settings.modules.business.title', 'Business')}
            </span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('admin.moduleAccess.form.duration', 'Trajanje')}</Label>
        <Select value={duration} onValueChange={(v) => setDuration(v as DurationKey)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[70]">
            <SelectItem value="7d">{t('admin.moduleAccess.duration.7d', '7 dana')}</SelectItem>
            <SelectItem value="30d">{t('admin.moduleAccess.duration.30d', '30 dana')}</SelectItem>
            <SelectItem value="90d">{t('admin.moduleAccess.duration.90d', '90 dana')}</SelectItem>
            <SelectItem value="365d">{t('admin.moduleAccess.duration.365d', '1 godina')}</SelectItem>
            <SelectItem value="permanent">
              {t('admin.moduleAccess.duration.permanent', 'Trajno')}
            </SelectItem>
            <SelectItem value="custom">
              {t('admin.moduleAccess.duration.custom', 'Prilagođeno…')}
            </SelectItem>
          </SelectContent>
        </Select>
        {duration === 'custom' && (
          <Input
            type="datetime-local"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
          />
        )}
        {customInvalid && (
          <p className="text-xs text-destructive">
            {t('admin.moduleAccess.form.dateMustBeFuture', 'Datum mora biti u budućnosti.')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t('admin.moduleAccess.form.reasonCode', 'Razlog')}</Label>
        <Select value={reasonCode} onValueChange={(v) => setReasonCode(v as GrantReasonCode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[70]">
            {REASON_CODES.map((rc) => (
              <SelectItem key={rc} value={rc}>
                {t(REASON_KEY[rc], rc)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason-note">
          {t('admin.moduleAccess.form.reasonNote', 'Napomena')}
          {noteRequired && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Textarea
          id="reason-note"
          value={reasonNote}
          onChange={(e) => setReasonNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={
            noteRequired
              ? t('admin.moduleAccess.form.reasonNoteRequiredPh', 'Obavezno objasni razlog…')
              : t('admin.moduleAccess.form.reasonNotePh', 'Opcionalno…')
          }
        />
        {noteInvalid && (
          <p className="text-xs text-destructive">
            {t('admin.moduleAccess.form.reasonNoteRequired', 'Za razlog "Ostalo" napomena je obavezna.')}
          </p>
        )}
      </div>

      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {t('admin.moduleAccess.form.submit', 'Dodijeli pristup')}
      </Button>
    </div>
  );
};
