import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  Smartphone, 
  Check, 
  ArrowLeft, 
  Share, 
  MoreVertical,
  HelpCircle,
  PlusCircle,
  ArrowRightLeft,
  Receipt,
  FileText,
  PieChart,
  Wallet,
  Tag,
  TrendingUp
} from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const helpSections = [
  {
    icon: PlusCircle,
    title: "Dodavanje transakcija",
    content: [
      "Kliknite na '+' gumb u gornjem desnom kutu",
      "Odaberite vrstu: Prihod, Rashod ili Transfer",
      "Unesite iznos, opis, kategoriju i datum",
      "Za rashode možete dodati i fotografiju računa"
    ]
  },
  {
    icon: ArrowRightLeft,
    title: "Transferi između izvora",
    content: [
      "Transferi služe za praćenje prijenosa novca između vaših izvora prihoda",
      "Npr. prijenos s bankovnog računa na gotovinu",
      "Transfer ne utječe na ukupni saldo - samo preraspodijeli sredstva"
    ]
  },
  {
    icon: Wallet,
    title: "Izvori prihoda",
    content: [
      "Kreirajte izvore prihoda poput: Plaća, Gotovina, Revolut, itd.",
      "Svaki izvor ima svoj saldo koji se automatski ažurira",
      "Prihodi povećavaju saldo izvora, rashodi ga smanjuju",
      "Kliknite na izvor da vidite sve povezane transakcije"
    ]
  },
  {
    icon: Tag,
    title: "Kategorije",
    content: [
      "Koristite ugrađene kategorije ili kreirajte vlastite",
      "Kategorije pomažu u praćenju potrošnje po grupama",
      "Kliknite na kategoriju da vidite sve transakcije u njoj"
    ]
  },
  {
    icon: Receipt,
    title: "Skeniranje računa",
    content: [
      "Prilikom dodavanja rashoda možete fotografirati račun",
      "AI automatski prepoznaje iznos i trgovinu",
      "Fotografija se sprema uz transakciju za kasniji pregled"
    ]
  },
  {
    icon: FileText,
    title: "Import iz banke",
    content: [
      "Podržan je import CSV izvoda iz većine banaka",
      "Idite na 'Bankovna poveznica' u bočnoj traci",
      "Odaberite CSV datoteku i banku iz koje dolazi",
      "Transakcije će se automatski kategorizirati"
    ]
  },
  {
    icon: PieChart,
    title: "Izvještaji",
    content: [
      "Kliknite na 'Izvještaji' gumb za detaljan pregled",
      "Pregledajte potrošnju po kategorijama i mjesecima",
      "Filtrirajte po datumu i izvozu u PDF"
    ]
  },
  {
    icon: TrendingUp,
    title: "Sažetak i statistika",
    content: [
      "Na vrhu stranice vidite ukupne prihode, rashode i saldo",
      "Kliknite na bilo koju karticu za detaljan pregled transakcija",
      "Grafikon kategorija pokazuje raspodjelu potrošnje"
    ]
  }
];

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
    
    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Listen for the beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isStandalone || isInstalled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Check className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Aplikacija je instalirana!</h1>
          <p className="text-muted-foreground mb-6">
            V&M Balance je uspješno instaliran na tvoj uređaj. Možeš ga pronaći na početnom ekranu.
          </p>
          <Button onClick={() => navigate('/')} className="rounded-xl">
            Otvori aplikaciju
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="rounded-xl"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <img src={logo} alt="V&M Balance" className="w-8 h-8 object-contain" />
          <span className="font-semibold">V&M Balance</span>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full">
        <Tabs defaultValue="install" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="install" className="gap-2">
              <Download className="w-4 h-4" />
              Instalacija
            </TabsTrigger>
            <TabsTrigger value="help" className="gap-2">
              <HelpCircle className="w-4 h-4" />
              Upute
            </TabsTrigger>
          </TabsList>

          {/* Install Tab */}
          <TabsContent value="install">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              {/* App Icon */}
              <div className="w-24 h-24 mx-auto mb-6">
                <img src={logo} alt="V&M Balance" className="w-full h-full object-contain rounded-2xl shadow-lg" />
              </div>

              <h1 className="text-2xl font-bold mb-2">Instaliraj V&M Balance</h1>
              <p className="text-muted-foreground mb-8">
                Dodaj aplikaciju na početni ekran za brži pristup i offline rad.
              </p>

              {/* Install options */}
              <div className="space-y-4">
                {deferredPrompt && (
                  <Button
                    onClick={handleInstall}
                    size="lg"
                    className="w-full rounded-xl h-14 text-lg gap-3"
                  >
                    <Download className="w-5 h-5" />
                    Instaliraj sada
                  </Button>
                )}

                {isIOS && (
                  <div className="bg-muted/50 rounded-2xl p-6 text-left space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Smartphone className="w-5 h-5" />
                      Kako instalirati na iPhone/iPad
                    </h3>
                    <ol className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">1</span>
                        <span>Otvori izbornik za dijeljenje <Share className="w-4 h-4 inline" /></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">2</span>
                        <span>Pomakni se dolje i odaberi <strong>"Dodaj na početni zaslon"</strong></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">3</span>
                        <span>Potvrdi klikom na <strong>"Dodaj"</strong></span>
                      </li>
                    </ol>
                  </div>
                )}

                {!isIOS && !deferredPrompt && (
                  <div className="bg-muted/50 rounded-2xl p-6 text-left space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Smartphone className="w-5 h-5" />
                      Kako instalirati na Android
                    </h3>
                    <ol className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">1</span>
                        <span>Otvori izbornik preglednika <MoreVertical className="w-4 h-4 inline" /></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">2</span>
                        <span>Odaberi <strong>"Instaliraj aplikaciju"</strong> ili <strong>"Dodaj na početni zaslon"</strong></span>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">3</span>
                        <span>Potvrdi instalaciju</span>
                      </li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                <div className="p-3">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground">Radi offline</p>
                </div>
                <div className="p-3">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Download className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground">Brže učitavanje</p>
                </div>
                <div className="p-3">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Check className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground">Kao prava app</p>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* Help Tab */}
          <TabsContent value="help">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <HelpCircle className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Upute za korištenje</h1>
                <p className="text-muted-foreground">
                  Sve što trebaš znati o V&M Balance aplikaciji
                </p>
              </div>

              <ScrollArea className="h-[55vh]">
                <div className="space-y-4 pr-4">
                  {helpSections.map((section, index) => (
                    <div 
                      key={index} 
                      className="bg-muted/50 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-primary/10">
                          <section.icon className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="font-semibold">{section.title}</h3>
                      </div>
                      <ul className="space-y-1 ml-10">
                        {section.content.map((item, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  <div className="bg-primary/10 rounded-xl p-4 mt-4">
                    <h3 className="font-semibold mb-2">💡 Savjet</h3>
                    <p className="text-sm text-muted-foreground">
                      Za najbolje iskustvo, redovito unosite transakcije i kategorizirajte ih. 
                      Tako ćete imati jasniji uvid u svoje financije.
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Install;