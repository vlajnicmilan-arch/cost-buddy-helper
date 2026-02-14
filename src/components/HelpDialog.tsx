import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  HelpCircle, 
  PlusCircle, 
  ArrowRightLeft, 
  Receipt, 
  FileText, 
  PieChart, 
  Download, 
  Smartphone,
  Wallet,
  Tag,
  TrendingUp
} from "lucide-react";
import { useTranslation } from "react-i18next";

const HelpDialog = () => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const sections = [
    {
      icon: PlusCircle,
      title: t('help.addTransactions', 'Dodavanje transakcija'),
      content: [
        t('help.addTransactionsStep1', "Kliknite na '+' gumb u gornjem desnom kutu"),
        t('help.addTransactionsStep2', "Odaberite vrstu: Prihod, Rashod ili Transfer"),
        t('help.addTransactionsStep3', "Unesite iznos, opis, kategoriju i datum"),
        t('help.addTransactionsStep4', "Za rashode možete dodati i fotografiju računa")
      ]
    },
    {
      icon: ArrowRightLeft,
      title: t('help.transfers', 'Transferi između izvora'),
      content: [
        t('help.transfersStep1', "Transferi služe za praćenje prijenosa novca između vaših izvora prihoda"),
        t('help.transfersStep2', "Npr. prijenos s bankovnog računa na gotovinu"),
        t('help.transfersStep3', "Transfer ne utječe na ukupni saldo - samo preraspodijeli sredstva")
      ]
    },
    {
      icon: Wallet,
      title: t('help.paymentSources', 'Izvori plaćanja'),
      content: [
        t('help.paymentSourcesStep1', "Kreirajte izvore prihoda poput: Plaća, Gotovina, Revolut, itd."),
        t('help.paymentSourcesStep2', "Svaki izvor ima svoj saldo koji se automatski ažurira"),
        t('help.paymentSourcesStep3', "Prihodi povećavaju saldo izvora, rashodi ga smanjuju"),
        t('help.paymentSourcesStep4', "Kliknite na izvor da vidite sve povezane transakcije")
      ]
    },
    {
      icon: Tag,
      title: t('help.categories', 'Kategorije'),
      content: [
        t('help.categoriesStep1', "Koristite ugrađene kategorije ili kreirajte vlastite"),
        t('help.categoriesStep2', "Kategorije pomažu u praćenju potrošnje po grupama"),
        t('help.categoriesStep3', "Kliknite na kategoriju da vidite sve transakcije u njoj")
      ]
    },
    {
      icon: Receipt,
      title: t('help.receiptScanning', 'Skeniranje računa'),
      content: [
        t('help.receiptScanningStep1', "Prilikom dodavanja rashoda možete fotografirati račun"),
        t('help.receiptScanningStep2', "AI automatski prepoznaje iznos i trgovinu"),
        t('help.receiptScanningStep3', "Fotografija se sprema uz transakciju za kasniji pregled")
      ]
    },
    {
      icon: FileText,
      title: t('help.bankImport', 'Import iz banke'),
      content: [
        t('help.bankImportStep1', "Podržan je import CSV izvoda iz većine banaka"),
        t('help.bankImportStep2', "Idite na 'Bankovna poveznica' u bočnoj traci"),
        t('help.bankImportStep3', "Odaberite CSV datoteku i banku iz koje dolazi"),
        t('help.bankImportStep4', "Transakcije će se automatski kategorizirati")
      ]
    },
    {
      icon: PieChart,
      title: t('help.reports', 'Izvještaji'),
      content: [
        t('help.reportsStep1', "Kliknite na 'Izvještaji' gumb za detaljan pregled"),
        t('help.reportsStep2', "Pregledajte potrošnju po kategorijama i mjesecima"),
        t('help.reportsStep3', "Filtrirajte po datumu i izvezite u PDF")
      ]
    },
    {
      icon: TrendingUp,
      title: t('help.summary', 'Sažetak i statistika'),
      content: [
        t('help.summaryStep1', "Na vrhu stranice vidite ukupne prihode, rashode i saldo"),
        t('help.summaryStep2', "Kliknite na bilo koju karticu za detaljan pregled transakcija"),
        t('help.summaryStep3', "Grafikon kategorija pokazuje raspodjelu potrošnje")
      ]
    },
    {
      icon: Download,
      title: t('help.backup', 'Backup i obnova'),
      content: [
        t('help.backupStep1', "Redovito radite backup podataka"),
        t('help.backupStep2', "U lokalnom načinu rada, podaci se čuvaju na vašem uređaju"),
        t('help.backupStep3', "U cloud načinu, podaci su automatski sinkronizirani")
      ]
    },
    {
      icon: Smartphone,
      title: t('help.mobileInstall', 'Instalacija na mobitel'),
      content: [
        t('help.mobileInstallStep1', "Aplikaciju možete instalirati kao mobilnu aplikaciju"),
        t('help.mobileInstallStep2', "Android: Menu (⋮) → 'Instaliraj aplikaciju'"),
        t('help.mobileInstallStep3', "iPhone: Share (⬆) → 'Dodaj na početni zaslon'"),
        t('help.mobileInstallStep4', "Posjetite /install stranicu za detaljne upute")
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title={t('help.title', 'Upute za korištenje')}>
          <HelpCircle className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <HelpCircle className="w-6 h-6 text-primary" />
            {t('help.title', 'Upute za korištenje')}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[65vh] pr-4">
          <div className="space-y-6">
            <p className="text-muted-foreground">
              {t('help.intro', 'V&M Balance je aplikacija za praćenje osobnih financija. Evo kako ju koristiti:')}
            </p>
            
            {sections.map((section, index) => (
              <div 
                key={index} 
                className="bg-muted/50 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-primary/10">
                    <section.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">{section.title}</h3>
                </div>
                <ul className="space-y-1 ml-11">
                  {section.content.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            
            <div className="bg-primary/10 rounded-lg p-4 mt-6">
              <h3 className="font-semibold mb-2">💡 {t('help.tip', 'Savjet')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('help.tipContent', 'Za najbolje iskustvo, redovito unosite transakcije i kategorizirajte ih. Tako ćete imati jasniji uvid u svoje financije i moći donositi bolje odluke.')}
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
