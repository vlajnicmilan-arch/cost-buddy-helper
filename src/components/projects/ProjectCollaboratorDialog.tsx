import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectCollaborator, ProjectCollaboratorInput } from '@/types/projectCollaborator';
import { useTranslation } from 'react-i18next';

interface Milestone {
  id: string;
  name: string;
}

interface ProjectCollaboratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator: ProjectCollaborator | null;
  milestones: Milestone[];
  onSave: (data: ProjectCollaboratorInput) => void;
}

export const ProjectCollaboratorDialog = ({
  open,
  onOpenChange,
  collaborator,
  milestones,
  onSave,
}: ProjectCollaboratorDialogProps) => {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [milestoneId, setMilestoneId] = useState('none');
  const [status, setStatus] = useState('active');
  const [contactInfo, setContactInfo] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (collaborator) {
      setFirstName(collaborator.first_name);
      setLastName(collaborator.last_name);
      setCompanyName(collaborator.company_name || '');
      setServiceDescription(collaborator.service_description);
      setTotalPrice(String(collaborator.total_price));
      setPaidAmount(String(collaborator.paid_amount || 0));
      setMilestoneId(collaborator.milestone_id || 'none');
      setStatus(collaborator.status);
      setContactInfo(collaborator.contact_info || '');
      setNote(collaborator.note || '');
    } else {
      setFirstName('');
      setLastName('');
      setCompanyName('');
      setServiceDescription('');
      setTotalPrice('');
      setPaidAmount('');
      setMilestoneId('none');
      setStatus('active');
      setContactInfo('');
      setNote('');
    }
  }, [collaborator, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !serviceDescription.trim()) return;

    onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      company_name: companyName.trim() || null,
      service_description: serviceDescription.trim(),
      total_price: parseFloat(totalPrice) || 0,
      paid_amount: parseFloat(paidAmount) || 0,
      milestone_id: milestoneId === 'none' ? null : milestoneId,
      status,
      contact_info: contactInfo.trim() || null,
      note: note.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {collaborator
              ? t('collaborators.edit', 'Uredi suradnika')
              : t('collaborators.add', 'Dodaj vanjskog suradnika')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('workers.firstName', 'Ime')}</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t('workers.lastName', 'Prezime')}</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('collaborators.company', 'Tvrtka / obrt')}</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={t('common.optional', 'Opcionalno')} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('collaborators.serviceDescription', 'Opis usluge')}</Label>
            <Textarea value={serviceDescription} onChange={e => setServiceDescription(e.target.value)} required rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('collaborators.totalPrice', 'Ukupna cijena')}</Label>
            <Input type="number" step="0.01" min="0" value={totalPrice} onChange={e => setTotalPrice(e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <Label>{t('collaborators.milestone', 'Pridruži fazi')}</Label>
            <Select value={milestoneId} onValueChange={setMilestoneId}>
              <SelectTrigger>
                <SelectValue placeholder={t('collaborators.noMilestone', 'Bez faze')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('collaborators.noMilestone', 'Bez faze')}</SelectItem>
                {milestones.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.status', 'Status')}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('collaborators.statusActive', 'Aktivan')}</SelectItem>
                <SelectItem value="completed">{t('collaborators.statusCompleted', 'Završen')}</SelectItem>
                <SelectItem value="cancelled">{t('collaborators.statusCancelled', 'Otkazan')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('collaborators.contact', 'Kontakt')}</Label>
            <Input value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder={t('collaborators.contactPlaceholder', 'Email, telefon...')} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.note', 'Napomena')}</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
          </div>

          <Button type="submit" className="w-full">
            {collaborator ? t('common.save', 'Spremi') : t('collaborators.add', 'Dodaj vanjskog suradnika')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
