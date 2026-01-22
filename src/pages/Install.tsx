import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Download, Smartphone, Check, ArrowLeft, Share, MoreVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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
    <div className="min-h-screen bg-background flex flex-col p-6">
      {/* Header */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('/')}
        className="self-start rounded-xl mb-4"
      >
        <ArrowLeft className="w-5 h-5" />
      </Button>

      <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto">
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
      </div>
    </div>
  );
};

export default Install;