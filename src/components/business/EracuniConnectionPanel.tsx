import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, Unlink, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const EracuniConnectionPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    loadCredentials();
  }, [activeBusinessProfileId, user]);

  const loadCredentials = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('business_profiles')
      .select('eracuni_username, eracuni_secret_key, eracuni_token, eracuni_connected')
      .eq('id', activeBusinessProfileId!)
      .single();

    if (data) {
      setUsername((data as any).eracuni_username || '');
      setSecretKey((data as any).eracuni_secret_key || '');
      setToken((data as any).eracuni_token || '');
      setConnected((data as any).eracuni_connected || false);
    }
    setLoading(false);
  };

  const saveCredentials = async () => {
    if (!activeBusinessProfileId) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_profiles')
      .update({
        eracuni_username: username.trim() || null,
        eracuni_secret_key: secretKey.trim() || null,
        eracuni_token: token.trim() || null,
      } as any)
      .eq('id', activeBusinessProfileId);

    setSaving(false);
    if (error) {
      toast.error('Greška pri spremanju');
    } else {
      toast.success('API podaci spremljeni');
    }
  };

  const testConnection = async () => {
    if (!username.trim() || !secretKey.trim() || !token.trim()) {
      toast.error('Unesite sve API podatke');
      return;
    }
    
    // Save first
    await saveCredentials();
    
    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Niste prijavljeni'); setTesting(false); return; }

      const response = await supabase.functions.invoke('eracuni-proxy', {
        body: {
          action: 'test_connection',
          businessProfileId: activeBusinessProfileId,
        },
      });

      if (response.error) {
        toast.error(`Povezivanje neuspješno: ${response.error.message}`);
      } else if (response.data?.error) {
        toast.error(response.data.error);
      } else {
        toast.success('✅ Uspješno povezano s e-Računi!');
        setConnected(true);
      }
    } catch (err: any) {
      toast.error(err.message || 'Greška pri testiranju');
    }
    setTesting(false);
  };

  const disconnect = async () => {
    if (!activeBusinessProfileId) return;
    await supabase
      .from('business_profiles')
      .update({
        eracuni_username: null,
        eracuni_secret_key: null,
        eracuni_token: null,
        eracuni_connected: false,
      } as any)
      .eq('id', activeBusinessProfileId);
    
    setUsername('');
    setSecretKey('');
    setToken('');
    setConnected(false);
    toast.success('e-Računi odspojeni');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-lg">🧾</span>
          </div>
          <div>
            <h3 className="text-sm font-bold">e-Računi.hr</h3>
            <p className="text-[10px] text-muted-foreground">Fiskalizacija i e-Računi za obrtnike</p>
          </div>
        </div>
        {connected ? (
          <Badge className="bg-income/10 text-income text-[9px] gap-1">
            <CheckCircle2 className="w-3 h-3" /> Povezano
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] gap-1">
            <AlertCircle className="w-3 h-3" /> Nepovezano
          </Badge>
        )}
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            API pristupni podaci
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-3">
          <p className="text-[10px] text-muted-foreground">
            Podatke pronađite u e-Računi.hr → Postavke → Web servisi (API)
          </p>

          <div className="space-y-2">
            <Label className="text-xs">Korisničko ime</Label>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Vaše korisničko ime"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Secret Key</Label>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
                placeholder="API secret key"
                className="h-8 text-sm pr-8"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">API Token</Label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Token organizacije"
                className="h-8 text-sm pr-8"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-1 text-xs h-8"
              onClick={testConnection}
              disabled={testing || !username || !secretKey || !token}
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
              {connected ? 'Testiraj ponovo' : 'Poveži i testiraj'}
            </Button>
            {connected && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs h-8 text-destructive"
                onClick={disconnect}
              >
                <Unlink className="w-3 h-3" /> Odspoji
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {connected && (
        <Card className="border-none shadow-sm bg-income/5">
          <CardContent className="p-3">
            <p className="text-xs text-income font-medium">✅ Povezano s e-Računi.hr</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Sada možete fiskalizirati račune i slati e-Račune direktno iz aplikacije.
              Otvorite Fakturiranje → odaberite račun → "Fiskaliziraj" ili "Pošalji e-Račun".
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-sm">
        <CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">
            <strong>ℹ️ Kako dobiti API podatke:</strong><br />
            1. Prijavite se na <a href="https://e-racuni.hr" target="_blank" rel="noopener noreferrer" className="text-primary underline">e-racuni.hr</a><br />
            2. Idite na Postavke → Web servisi<br />
            3. Aktivirajte API i kopirajte korisničko ime, secret key i token<br />
            4. Zalijepite ih ovdje i kliknite "Poveži i testiraj"
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
