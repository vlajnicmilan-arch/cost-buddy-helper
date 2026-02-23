import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  TrendingUp,
  Monitor,
  Apple,
  Tablet,
  Globe,
  ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';
import { APP_VERSION } from '@/lib/version';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Capture referral from URL
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('referrer_id', ref);
    }

    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
    
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    const iOS = /ipad|iphone|ipod/.test(userAgent);
    const android = /android/.test(userAgent);
    const mac = /macintosh|mac os x/.test(userAgent) && !iOS;
    const windows = /windows/.test(userAgent);
    
    setIsIOS(iOS);
    setIsAndroid(android);
    setIsMac(mac);
    setIsWindows(windows);

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

  const getDetectedPlatform = () => {
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    if (isMac) return 'macos';
    if (isWindows) return 'windows';
    return 'web';
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
          <span className="text-xs text-muted-foreground">v{APP_VERSION}</span>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full">
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
              className="space-y-6"
            >
              {/* App Header */}
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4">
                  <img src={logo} alt="V&M Balance" className="w-full h-full object-contain rounded-2xl shadow-lg" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Instaliraj V&M Balance</h1>
                <p className="text-muted-foreground">
                  Aplikacija za praćenje troškova i upravljanje osobnim financijama
                </p>
              </div>

              {/* Quick Install Button */}
              {deferredPrompt && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="p-4">
                    <Button
                      onClick={handleInstall}
                      size="lg"
                      className="w-full rounded-xl h-14 text-lg gap-3"
                    >
                      <Download className="w-5 h-5" />
                      Instaliraj sada
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Platform Cards */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* iOS Card */}
                <Card className={`${getDetectedPlatform() === 'ios' ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Apple className="w-5 h-5" />
                      iPhone / iPad
                      {getDetectedPlatform() === 'ios' && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-auto">
                          Tvoj uređaj
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>Dodaj na početni zaslon</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">1</span>
                        <span>Otvori izbornik <Share className="w-4 h-4 inline mx-1" /> (dijeli)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">2</span>
                        <span>Odaberi "Dodaj na početni zaslon"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">3</span>
                        <span>Potvrdi klikom na "Dodaj"</span>
                      </li>
                    </ol>
                  </CardContent>
                </Card>

                {/* Android Card */}
                <Card className={`${getDetectedPlatform() === 'android' ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Smartphone className="w-5 h-5" />
                      Android
                      {getDetectedPlatform() === 'android' && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-auto">
                          Tvoj uređaj
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>Instaliraj kao aplikaciju</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {deferredPrompt ? (
                      <Button onClick={handleInstall} className="w-full gap-2">
                        <Download className="w-4 h-4" />
                        Instaliraj
                      </Button>
                    ) : (
                      <ol className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">1</span>
                          <span>Otvori izbornik <MoreVertical className="w-4 h-4 inline mx-1" /></span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">2</span>
                          <span>Odaberi "Instaliraj aplikaciju"</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">3</span>
                          <span>Potvrdi instalaciju</span>
                        </li>
                      </ol>
                    )}
                  </CardContent>
                </Card>

                {/* Windows Card */}
                <Card className={`${getDetectedPlatform() === 'windows' ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Monitor className="w-5 h-5" />
                      Windows
                      {getDetectedPlatform() === 'windows' && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-auto">
                          Tvoj uređaj
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>Instaliraj kao desktop app</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {deferredPrompt ? (
                      <Button onClick={handleInstall} className="w-full gap-2">
                        <Download className="w-4 h-4" />
                        Instaliraj
                      </Button>
                    ) : (
                      <ol className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">1</span>
                          <span>U adresnoj traci klikni ikonu instalacije</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">2</span>
                          <span>Ili otvori izbornik ⋮ → "Instaliraj..."</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">3</span>
                          <span>Aplikacija će se pojaviti u Start meniju</span>
                        </li>
                      </ol>
                    )}
                  </CardContent>
                </Card>

                {/* macOS Card */}
                <Card className={`${getDetectedPlatform() === 'macos' ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Apple className="w-5 h-5" />
                      macOS
                      {getDetectedPlatform() === 'macos' && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-auto">
                          Tvoj uređaj
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>Instaliraj kao Mac app</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {deferredPrompt ? (
                      <Button onClick={handleInstall} className="w-full gap-2">
                        <Download className="w-4 h-4" />
                        Instaliraj
                      </Button>
                    ) : (
                      <ol className="space-y-2 text-sm">
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">1</span>
                          <span>U Safari: File → Add to Dock</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">2</span>
                          <span>U Chrome: ⋮ → "Install V&M Balance..."</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-medium">3</span>
                          <span>Aplikacija će se pojaviti u Launchpadu</span>
                        </li>
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Web Access Card */}
              <Card className="bg-muted/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Globe className="w-5 h-5" />
                    Web pristup
                  </CardTitle>
                  <CardDescription>Koristi direktno u pregledniku</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    Možeš koristiti V&M Balance direktno u pregledniku bez instalacije. 
                    Spremi ovu adresu u bookmarke za brži pristup:
                  </p>
                  <div className="flex items-center gap-2 p-3 bg-background rounded-lg border">
                    <code className="text-sm flex-1 truncate">cost-buddy-helper.lovable.app</code>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => window.open('https://cost-buddy-helper.lovable.app', '_blank')}
                      className="shrink-0 gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Otvori
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Features */}
              <div className="grid grid-cols-3 gap-4 text-center pt-4">
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

              {/* Version Info */}
              <div className="text-center text-xs text-muted-foreground pt-4 border-t">
                <p>V&M Balance verzija {APP_VERSION}</p>
                <p className="mt-1">PWA (Progressive Web App) - radi na svim uređajima</p>
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