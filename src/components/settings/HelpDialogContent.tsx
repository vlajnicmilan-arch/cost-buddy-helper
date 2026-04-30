import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HelpCircle, Mail, Clock, ChevronRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContactSupportDialog } from '@/components/support/ContactSupportDialog';

interface HelpDialogContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const HelpDialogContent = ({ open, onOpenChange }: HelpDialogContentProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showSupport, setShowSupport] = useState(false);
  
  const sections = [
    {
      icon: "➕",
      title: t('help.addTransactions', 'Dodavanje transakcija'),
      content: [
        t('help.addTransactionsStep1', "Kliknite na '+' gumb u gornjem desnom kutu"),
        t('help.addTransactionsStep2', "Odaberite vrstu: Prihod, Rashod ili Transfer"),
        t('help.addTransactionsStep3', "Unesite iznos, opis, kategoriju i datum"),
        t('help.addTransactionsStep4', "Za rashode možete dodati i fotografiju računa")
      ]
    },
    {
      icon: "↔️",
      title: t('help.transfers', 'Transferi između izvora'),
      content: [
        t('help.transfersStep1', "Transferi služe za praćenje prijenosa novca između vaših izvora plaćanja"),
        t('help.transfersStep2', "Npr. prijenos s bankovnog računa na gotovinu"),
        t('help.transfersStep3', "Transfer ne utječe na ukupni saldo - samo preraspodijeli sredstva")
      ]
    },
    {
      icon: "💳",
      title: t('help.paymentSources', 'Izvori plaćanja'),
      content: [
        t('help.paymentSourcesStep1', "Kreirajte izvore plaćanja poput: Plaća, Gotovina, Revolut, itd."),
        t('help.paymentSourcesStep2', "Svaki izvor ima svoj saldo koji se automatski ažurira"),
        t('help.paymentSourcesStep3', "Prihodi povećavaju saldo izvora, rashodi ga smanjuju"),
        t('help.paymentSourcesStep4', "Kliknite na izvor da vidite sve povezane transakcije"),
        t('help.paymentSourcesStep5', "Kliknite na karticu 'Prilagođeni izvori plaćanja' za cjeloviti prikaz")
      ]
    },
    {
      icon: "👥",
      title: t('help.sharedAccounts', 'Dijeljeni računi'),
      content: [
        t('help.sharedAccountsStep1', "Dijelite izvore plaćanja s drugim korisnicima"),
        t('help.sharedAccountsStep2', "Kliknite na ikonu članova (👥) kod izvora plaćanja"),
        t('help.sharedAccountsStep3', "Pozovite članove putem email adrese"),
        t('help.sharedAccountsStep4', "Članovi mogu dodavati transakcije na dijeljeni račun"),
        t('help.sharedAccountsStep5', "Komentirajte transakcije klikom na ikonu komentara (💬)")
      ]
    },
    {
      icon: "🏷️",
      title: t('help.categories', 'Kategorije'),
      content: [
        t('help.categoriesStep1', "Koristite ugrađene kategorije ili kreirajte vlastite"),
        t('help.categoriesStep2', "Kategorije pomažu u praćenju potrošnje po grupama"),
        t('help.categoriesStep3', "Kliknite na kategoriju da vidite sve transakcije u njoj"),
        t('help.categoriesStep4', "Vlastite kategorije kreirate u sekciji 'Prilagođene kategorije'")
      ]
    },
    {
      icon: "📋",
      title: t('help.projects', 'Projekti'),
      content: [
        t('help.projectsStep1', "Kreirajte projekte za praćenje specifičnih troškova"),
        t('help.projectsStep2', "Svaki projekt ima budžet, faze (milestones) i vremensku crtu"),
        t('help.projectsStep3', "Dodajte radnike i pratite radne sate po projektu"),
        t('help.projectsStep4', "Pozovite članove tima za suradnju na projektu"),
        t('help.projectsStep5', "Generirajte izvještaje za svaki projekt")
      ]
    },
    {
      icon: "🎯",
      title: t('help.budgets', 'Budžeti'),
      content: [
        t('help.budgetsStep1', "Postavite mjesečne ili tjedne budžete"),
        t('help.budgetsStep2', "Definirajte limite potrošnje po kategorijama"),
        t('help.budgetsStep3', "Pratite potrošnju u odnosu na postavljene limite"),
        t('help.budgetsStep4', "Primajte obavijesti kada se približite ili premašite limit"),
        t('help.budgetsStep5', "Dijelite budžete s drugim korisnicima")
      ]
    },
    {
      icon: "📅",
      title: t('help.installments', 'Rate (obročno plaćanje)'),
      content: [
        t('help.installmentsStep1', "Pratite obročna plaćanja i rate"),
        t('help.installmentsStep2', "Unesite ukupni iznos, broj rata i datum prve rate"),
        t('help.installmentsStep3', "Aplikacija automatski generira raspored plaćanja"),
        t('help.installmentsStep4', "Preostale obveze umanjuju vaš neto iznos (Net Worth)")
      ]
    },
    {
      icon: "🔍",
      title: t('help.filtersAndBulk', 'Filteri i grupne akcije'),
      content: [
        t('help.filtersStep1', "Filtrirajte transakcije po tipu, kategoriji, izvoru plaćanja i datumu"),
        t('help.filtersStep2', "Koristite pretragu za brzo pronalaženje transakcija"),
        t('help.filtersStep3', "Označite više transakcija odjednom pomoću checkboxova"),
        t('help.filtersStep4', "Grupno mijenjajte kategoriju, izvor plaćanja ili brišite transakcije")
      ]
    },
    {
      icon: "🤖",
      title: t('help.aiAssistant', 'AI financijski asistent'),
      content: [
        t('help.aiAssistantStep1', "Kliknite na AI avatar u donjem desnom kutu ekrana"),
        t('help.aiAssistantStep2', "Postavite pitanja o vašim financijama na prirodnom jeziku"),
        t('help.aiAssistantStep3', "AI analizira vaše prihode, rashode, budžete i projekte"),
        t('help.aiAssistantStep4', "Dobijte savjete za uštedu i pregled trendova potrošnje"),
        t('help.aiAssistantStep5', "Možete ga uključiti/isključiti u Postavkama")
      ]
    },
    {
      icon: "🧾",
      title: t('help.receiptScanning', 'Skeniranje računa'),
      content: [
        t('help.receiptScanningStep1', "Prilikom dodavanja rashoda možete fotografirati račun"),
        t('help.receiptScanningStep2', "AI automatski prepoznaje iznos i trgovinu"),
        t('help.receiptScanningStep3', "Fotografija se sprema uz transakciju za kasniji pregled")
      ]
    },
    {
      icon: "📄",
      title: t('help.bankImport', 'Import iz banke'),
      content: [
        t('help.bankImportStep1', "Podržan je import CSV izvoda iz većine banaka"),
        t('help.bankImportStep2', "Kliknite na 'Bankovna poveznica' karticu na početnoj stranici"),
        t('help.bankImportStep3', "Odaberite CSV datoteku i banku iz koje dolazi"),
        t('help.bankImportStep4', "Transakcije će se automatski kategorizirati")
      ]
    },
    {
      icon: "📊",
      title: t('help.reports', 'Izvještaji'),
      content: [
        t('help.reportsStep1', "Kliknite na 'Izvještaji' gumb za detaljan pregled"),
        t('help.reportsStep2', "Pregledajte potrošnju po kategorijama i mjesecima"),
        t('help.reportsStep3', "Filtrirajte po datumu i izvezite u PDF")
      ]
    },
    {
      icon: "🔔",
      title: t('help.notifications', 'Obavijesti'),
      content: [
        t('help.notificationsStep1', "Kliknite na ikonu zvona u zaglavlju za pregled obavijesti"),
        t('help.notificationsStep2', "Primajte obavijesti o pozivnicama za dijeljene račune"),
        t('help.notificationsStep3', "Prihvatite ili odbijte pozivnice izravno iz obavijesti"),
        t('help.notificationsStep4', "Budžetna upozorenja stižu kada se približite limitu")
      ]
    },
    {
      icon: "📥",
      title: t('help.backup', 'Backup i obnova'),
      content: [
        t('help.backupStep1', "Redovito radite backup podataka"),
        t('help.backupStep2', "U lokalnom načinu rada, podaci se čuvaju na vašem uređaju"),
        t('help.backupStep3', "U cloud načinu, podaci su automatski sinkronizirani")
      ]
    },
    {
      icon: "⚙️",
      title: t('help.settings', 'Postavke'),
      content: [
        t('help.settingsStep1', "Kliknite na ikonu zupčanika u zaglavlju"),
        t('help.settingsStep2', "Promijenite ime, jezik, temu i valutu"),
        t('help.settingsStep3', "Uključite/isključite AI asistenta i jednostavni način rada"),
        t('help.settingsStep4', "Jednostavni način skriva projekte, budžete i rate")
      ]
    },
    {
      icon: "📱",
      title: t('help.install', 'Instalacija na mobitel'),
      content: [
        t('help.installStep1', "Aplikaciju možete instalirati kao mobilnu aplikaciju"),
        t('help.installStep2', "Android: Menu (⋮) → 'Instaliraj aplikaciju'"),
        t('help.installStep3', "iPhone: Share (⬆) → 'Dodaj na početni zaslon'"),
        t('help.installStep4', "Posjetite /install stranicu za detaljne upute")
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[100dvh] sm:max-h-[85vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <HelpCircle className="w-6 h-6 text-primary" />
            {t('help.title', 'Upute za korištenje')}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 max-h-[calc(100dvh-80px)] sm:max-h-[calc(85vh-80px)]">
          <div className="space-y-4 px-6 pb-6">
            <p className="text-muted-foreground text-sm">
              {t('help.intro', 'V&M Balance je aplikacija za praćenje osobnih financija. Evo kako ju koristiti:')}
            </p>

            {/* Contact support card — top of FAQ */}
            <button
              type="button"
              onClick={() => setShowSupport(true)}
              className="w-full text-left bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/15 hover:to-primary/10 border border-primary/20 rounded-lg p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm">
                      {t('help.contactSupport', 'Niste pronašli odgovor?')}
                    </h3>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('help.contactSupportDesc', 'Kontaktirajte nas direktno — odgovaramo unutar 24 sata.')}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <span className="inline-flex items-center gap-1 text-primary font-medium">
                      <Clock className="w-3 h-3" /> 24h
                    </span>
                    <span className="text-muted-foreground/80 truncate">support@vmbalance.com</span>
                  </div>
                </div>
              </div>
            </button>

            {sections.map((section, index) => (
              <div 
                key={index} 
                className="bg-muted/50 rounded-lg p-3 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-full bg-primary/10 text-base">
                    {section.icon}
                  </div>
                  <h3 className="font-semibold">{section.title}</h3>
                </div>
                <ul className="space-y-0.5 ml-10">
                  {section.content.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            
            <div className="bg-primary/10 rounded-lg p-4">
              <h3 className="font-semibold mb-2">💡 {t('help.tip', 'Savjet')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('help.tipContent', 'Za najbolje iskustvo, redovito unosite transakcije i kategorizirajte ih. Tako ćete imati jasniji uvid u svoje financije i moći donositi bolje odluke.')}
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>

      <ContactSupportDialog
        open={showSupport}
        onOpenChange={setShowSupport}
      />
    </Dialog>
  );
};
