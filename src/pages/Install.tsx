import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Download, 
  Smartphone, 
  Check, 
  ArrowLeft, 
  Share, 
  MoreVertical,
  ChevronDown,
  Monitor,
  Apple,
  Globe,
  ExternalLink,
  Package
} from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.webp';
import { APP_VERSION } from '@/lib/version';
import { downloadApk } from '@/lib/downloadApk';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const apkUrl = `${supabaseUrl}/storage/v1/object/public/public-assets/vm-balance.apk?download=vm-balance.apk`;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'ios' | 'android' | 'macos' | 'windows' | 'web';
type Browser = 'chrome' | 'samsung' | 'firefox' | 'safari' | 'edge' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|iphone|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  if (/windows/.test(ua)) return 'windows';
  return 'web';
}

function detectBrowser(): Browser {
  const ua = navigator.userAgent.toLowerCase();
  if (/samsungbrowser/.test(ua)) return 'samsung';
  if (/edg\//.test(ua)) return 'edge';
  if (/firefox/.test(ua)) return 'firefox';
  if (/chrome|crios/.test(ua) && !/edg\//.test(ua) && !/samsungbrowser/.test(ua)) return 'chrome';
  if (/safari/.test(ua) && !/chrome/.test(ua)) return 'safari';
  return 'other';
}

function getBrowserName(browser: Browser): string {
  const names: Record<Browser, string> = {
    chrome: 'Chrome',
    samsung: 'Samsung Internet',
    firefox: 'Firefox',
    safari: 'Safari',
    edge: 'Edge',
    other: 'preglednik',
  };
  return names[browser];
}

function getPlatformLabel(platform: Platform): string {
  const labels: Record<Platform, string> = {
    ios: 'iPhone / iPad',
    android: 'Android',
    macos: 'macOS',
    windows: 'Windows',
    web: 'Web',
  };
  return labels[platform];
}

function getPlatformIcon(platform: Platform) {
  switch (platform) {
    case 'ios': return Apple;
    case 'android': return Smartphone;
    case 'macos': return Apple;
    case 'windows': return Monitor;
    default: return Globe;
  }
}

interface Step { text: string; icon?: React.ReactNode }

function getInstallSteps(platform: Platform, browser: Browser): Step[] {
  if (platform === 'ios') {
    return [
      { text: 'Otvori u Safari pregledniku', icon: <Globe className="w-4 h-4 inline" /> },
      { text: 'Klikni ikonu za dijeljenje', icon: <Share className="w-4 h-4 inline" /> },
      { text: 'Odaberi "Dodaj na početni zaslon"' },
      { text: 'Potvrdi klikom na "Dodaj"' },
    ];
  }

  if (platform === 'android') {
    if (browser === 'samsung') {
      return [
        { text: 'Klikni izbornik', icon: <MoreVertical className="w-4 h-4 inline" /> },
        { text: 'Odaberi "Dodaj stranicu na"' },
        { text: 'Odaberi "Početni zaslon"' },
        { text: 'Potvrdi klikom na "Dodaj"' },
      ];
    }
    if (browser === 'firefox') {
      return [
        { text: 'Klikni izbornik ⋮ (tri točke)' },
        { text: 'Odaberi "Instaliraj"' },
        { text: 'Potvrdi instalaciju' },
      ];
    }
    // Chrome / Edge / other
    return [
      { text: 'Klikni izbornik', icon: <MoreVertical className="w-4 h-4 inline" /> },
      { text: 'Odaberi "Instaliraj aplikaciju"' },
      { text: 'Potvrdi instalaciju' },
    ];
  }

  if (platform === 'macos') {
    if (browser === 'safari') {
      return [
        { text: 'Klikni File → Add to Dock' },
        { text: 'Aplikacija će se pojaviti u Docku' },
      ];
    }
    return [
      { text: 'Klikni izbornik ⋮ u adresnoj traci' },
      { text: 'Odaberi "Install V&M Balance..."' },
      { text: 'Aplikacija će se pojaviti u Launchpadu' },
    ];
  }

  if (platform === 'windows') {
    return [
      { text: 'U adresnoj traci klikni ikonu instalacije' },
      { text: 'Ili otvori izbornik ⋮ → "Instaliraj..."' },
      { text: 'Aplikacija će se pojaviti u Start meniju' },
    ];
  }

  return [
    { text: 'Otvori u Chrome, Edge ili Safari pregledniku' },
    { text: 'Potraži opciju instalacije u izborniku preglednika' },
  ];
}

const StepList = ({ steps }: { steps: Step[] }) => (
  <ol className="space-y-3">
    {steps.map((step, i) => (
      <li key={i} className="flex items-start gap-3">
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-semibold">
          {i + 1}
        </span>
        <span className="text-sm pt-0.5">
          {step.icon && <span className="mr-1.5">{step.icon}</span>}
          {step.text}
        </span>
      </li>
    ))}
  </ol>
);

const PlatformCard = ({ 
  platform, 
  browser, 
  detected = false, 
  deferredPrompt, 
  onInstall 
}: { 
  platform: Platform; 
  browser: Browser; 
  detected?: boolean; 
  deferredPrompt: BeforeInstallPromptEvent | null; 
  onInstall: () => void;
}) => {
  const Icon = getPlatformIcon(platform);
  const steps = getInstallSteps(platform, browser);
  const canPrompt = deferredPrompt && (platform === 'android' || platform === 'windows' || platform === 'macos');

  return (
    <Card className={detected ? 'border-primary ring-2 ring-primary/20' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="w-5 h-5" />
          {getPlatformLabel(platform)}
          {detected && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-auto">
              Tvoj uređaj
            </span>
          )}
        </CardTitle>
        {detected && platform !== 'ios' && (
          <p className="text-xs text-muted-foreground">
            Preglednik: {getBrowserName(browser)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {canPrompt ? (
          <Button onClick={onInstall} className="w-full gap-2 rounded-xl h-12 text-base">
            <Download className="w-5 h-5" />
            Instaliraj sada
          </Button>
        ) : (
          <StepList steps={steps} />
        )}
      </CardContent>
    </Card>
  );
};

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showOther, setShowOther] = useState(false);

  const platform = detectPlatform();
  const browser = detectBrowser();

  const otherPlatforms: Platform[] = (['ios', 'android', 'windows', 'macos'] as Platform[])
    .filter(p => p !== platform);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('referrer_id', ref);

    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isStandalone || isInstalled) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6">
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
          <Button onClick={() => navigate('/home')} className="rounded-xl">
            Otvori aplikaciju
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/home')} className="rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <img src={logo} alt="V&M Balance" className="w-8 h-8 object-contain" />
          <span className="font-semibold">V&M Balance</span>
          <span className="text-xs text-muted-foreground">v{APP_VERSION}</span>
        </div>
        <div className="w-10" />
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* App Header */}
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4">
              <img src={logo} alt="V&M Balance" className="w-full h-full object-contain rounded-2xl shadow-lg" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Instaliraj V&M Balance</h1>
            <p className="text-muted-foreground text-sm">
              Besplatna aplikacija za praćenje troškova
            </p>
          </div>

          {platform === 'android' ? (
            <>
              {/* Primary: APK download for Android */}
              <Card className="border-primary ring-2 ring-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="w-5 h-5" />
                    Preuzmi aplikaciju
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full ml-auto">
                      Preporučeno
                    </span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Nativna verzija za tvoj Android uređaj
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    className="w-full gap-2 rounded-xl h-12 text-base"
                    onClick={() => downloadApk(apkUrl)}
                  >
                    <Download className="w-5 h-5" />
                    Preuzmi APK
                  </Button>
                  <ol className="space-y-2">
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-semibold">1</span>
                      <span className="text-sm pt-0.5">Klikni "Preuzmi APK" iznad</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-semibold">2</span>
                      <span className="text-sm pt-0.5">Otvori preuzetu datoteku</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-semibold">3</span>
                      <span className="text-sm pt-0.5">Dozvoli instalaciju iz nepoznatih izvora ako se traži</span>
                    </li>
                  </ol>
                </CardContent>
              </Card>

              {/* Secondary: PWA as collapsible */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between text-muted-foreground text-sm">
                    Alternativna instalacija (PWA)
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <PlatformCard
                    platform={platform}
                    browser={browser}
                    deferredPrompt={deferredPrompt}
                    onInstall={handleInstall}
                  />
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : (
            /* Primary: detected platform (iOS/Desktop) */
            <PlatformCard
              platform={platform}
              browser={browser}
              detected
              deferredPrompt={deferredPrompt}
              onInstall={handleInstall}
            />
          )}

          {/* Web access */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Web pristup bez instalacije</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 bg-background rounded-lg border">
                <code className="text-xs flex-1 truncate">cost-buddy-helper.lovable.app</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open('https://cost-buddy-helper.lovable.app', '_blank')}
                  className="shrink-0 gap-1 h-7 text-xs"
                >
                  <ExternalLink className="w-3 h-3" />
                  Otvori
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Features strip */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { icon: Smartphone, label: 'Radi offline' },
              { icon: Download, label: 'Brže učitavanje' },
              { icon: Check, label: 'Kao prava app' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="p-2">
                <div className="w-9 h-9 mx-auto mb-1.5 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {/* Other platforms collapsible */}
          {otherPlatforms.length > 0 && (
            <Collapsible open={showOther} onOpenChange={setShowOther}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-muted-foreground text-sm">
                  Ostale platforme
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showOther ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                {otherPlatforms.map(p => (
                  <PlatformCard
                    key={p}
                    platform={p}
                    browser={browser}
                    deferredPrompt={deferredPrompt}
                    onInstall={handleInstall}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Version */}
          <div className="text-center text-xs text-muted-foreground pt-2 border-t">
            <p>V&M Balance v{APP_VERSION} • PWA</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Install;
