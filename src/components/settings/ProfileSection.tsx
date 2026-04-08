import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Pencil, Loader2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ProfileSectionProps {
  displayName: string;
  editingName: boolean;
  setEditingName: (v: boolean) => void;
  tempName: string;
  setTempName: (v: string) => void;
  savingName: boolean;
  onSaveName: () => void;
  onCancelEditName: () => void;
}

export const ProfileSection = ({
  displayName, editingName, setEditingName,
  tempName, setTempName, savingName,
  onSaveName, onCancelEditName
}: ProfileSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t('settings.profile', 'Profil')}
      </h3>
      
      <div className="p-3 bg-muted/30 rounded-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <Label className="text-sm font-medium">
              {t('settings.displayName', 'Vaše ime')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.displayNameDesc', 'Ime koje se koristi za personalizirane poruke')}
            </p>
          </div>
          {!editingName && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditingName(true)}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        {editingName ? (
          <div className="flex gap-2">
            <Input
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder={t('onboarding.namePlaceholder', 'npr. Marko')}
              className="flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveName();
                if (e.key === 'Escape') onCancelEditName();
              }}
            />
            <Button size="sm" onClick={onSaveName} disabled={savingName}>
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEditName} disabled={savingName}>
              {t('common.cancel', 'Odustani')}
            </Button>
          </div>
        ) : (
          <p className="text-sm font-medium pl-12">
            {displayName || t('settings.noName', 'Nije postavljeno')}
          </p>
        )}
      </div>
    </div>
  );
};
