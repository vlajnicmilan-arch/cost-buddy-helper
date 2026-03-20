import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Link2, Unlink, Eye, EyeOff, CheckCircle2, AlertCircle, Upload, ShieldCheck, Trash2, FileKey } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const EracuniConnectionPanel = () => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Certificate state
  const [certUploaded, setCertUploaded] = useState(false);
  const [certUploadedAt, setCertUploadedAt] = useState<string | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [showCertPassword, setShowCertPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingCert, setDeletingCert] = useState(false);

  // e-Računi API state
  const [username, setUsername] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [fiscalizationEnabled, setFiscalizationEnabled] = useState(false);

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    loadCredentials();
  }, [activeBusinessProfileId, user]);

  const loadCredentials = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('business_profiles')
      .select('eracuni_username, eracuni_secret_key, eracuni_token, eracuni_connected, certificate_path, certificate_password, certificate_uploaded_at, fiscalization_enabled')
      .eq('id', activeBusinessProfileId!)
      .single();

    if (data) {
      const d = data as any;
      setUsername(d.eracuni_username || '');
      setSecretKey(d.eracuni_secret_key || '');
      setToken(d.eracuni_token || '');
      setConnected(d.eracuni_connected || false);
      setCertUploaded(!!d.certificate_path);
      setCertPassword(d.certificate_password || '');
      setCertUploadedAt(d.certificate_uploaded_at || null);
      setFiscalizationEnabled(d.fiscalization_enabled || false);
    }
    setLoading(false);
  };

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeBusinessProfileId) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['p12', 'pfx'].includes(ext || '')) {
      toast.error('Samo .p12 ili .pfx datoteke su dozvoljene');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('toasts.certTooLarge'));
      return;
    }

    if (!certPassword.trim()) {
      toast.error(t('toasts.enterCertPassword'));
      return;
    }

    setUploading(true);
    const filePath = `${user.id}/${activeBusinessProfileId}.${ext}`;

    // Delete old cert if exists
    await supabase.storage.from('certificates').remove([filePath]);

    const { error: uploadError } = await supabase.storage
      .from('certificates')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error(`Greška pri uploadu: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    // Save path and password to profile
    const { error: updateError } = await supabase
      .from('business_profiles')
      .update({
        certificate_path: filePath,
        certificate_password: certPassword.trim(),
        certificate_uploaded_at: new Date().toISOString(),
        fiscalization_enabled: true,
      } as any)
      .eq('id', activeBusinessProfileId);

    if (updateError) {
      toast.error(t('toasts.certDataError'));
    } else {
      toast.success(t('toasts.certImported'));
      setCertUploaded(true);
      setCertUploadedAt(new Date().toISOString());
      setFiscalizationEnabled(true);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteCertificate = async () => {
    if (!user || !activeBusinessProfileId) return;
    setDeletingCert(true);

    const { data: profile } = await supabase
      .from('business_profiles')
      .select('certificate_path')
      .eq('id', activeBusinessProfileId)
      .single();

    if ((profile as any)?.certificate_path) {
      await supabase.storage.from('certificates').remove([(profile as any).certificate_path]);
    }

    await supabase
      .from('business_profiles')
      .update({
        certificate_path: null,
        certificate_password: null,
        certificate_uploaded_at: null,
        fiscalization_enabled: false,
      } as any)
      .eq('id', activeBusinessProfileId);

    setCertUploaded(false);
    setCertPassword('');
    setCertUploadedAt(null);
    setFiscalizationEnabled(false);
    setDeletingCert(false);
    toast.success('Certifikat uklonjen');
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
    if (error) toast.error(t('toasts.profileSaveError'));
    else toast.success(t('toasts.apiDataSaved'));
  };

  const testConnection = async () => {
    if (!username.trim() || !secretKey.trim() || !token.trim()) {
      toast.error(t('toasts.enterAllApiData'));
      return;
    }
    await saveCredentials();
    setTesting(true);
    try {
      const response = await supabase.functions.invoke('eracuni-proxy', {
        body: { action: 'test_connection', businessProfileId: activeBusinessProfileId },
      });

      if (response.error) {
        toast.error(`Povezivanje neuspješno: ${response.error.message}`);
      } else if (response.data?.error) {
        toast.error(response.data.error);
      } else {
        toast.success(t('toasts.eracuniConnected'));
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

    setUsername(''); setSecretKey(''); setToken('');
    setConnected(false);
    toast.success(t('toasts.eracuniDisconnected'));
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
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg">🧾</span>
        </div>
        <div>
          <h3 className="text-sm font-bold">e-Računi & Fiskalizacija</h3>
          <p className="text-[10px] text-muted-foreground">Za obrtnike i slobodna zanimanja</p>
        </div>
      </div>

      {/* STEP 1: Certificate Upload */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">1</span>
            Fina digitalni certifikat
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-3">
          {certUploaded ? (
            <>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-income/5">
                <ShieldCheck className="w-4 h-4 text-income flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-income">Certifikat uvezen</p>
                  {certUploadedAt && (
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(certUploadedAt).toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={deleteCertificate}
                  disabled={deletingCert}
                >
                  {deletingCert ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground">
                Za fiskalizaciju računa potreban je Fina digitalni certifikat (.p12 ili .pfx).
                Nabavite ga na <a href="https://www.fina.hr" target="_blank" rel="noopener noreferrer" className="text-primary underline">fina.hr</a>.
              </p>

              <div className="space-y-2">
                <Label className="text-xs">Lozinka certifikata *</Label>
                <div className="relative">
                  <Input
                    type={showCertPassword ? 'text' : 'password'}
                    value={certPassword}
                    onChange={e => setCertPassword(e.target.value)}
                    placeholder={t('placeholders.certPassword')}
                    className="h-8 text-sm pr-8"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowCertPassword(!showCertPassword)}
                  >
                    {showCertPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".p12,.pfx"
                className="hidden"
                onChange={handleCertUpload}
              />
              <Button
                variant="outline"
                className="w-full gap-1.5 text-xs h-9"
                onClick={() => {
                  if (!certPassword.trim()) {
                    toast.error('Najprije unesite lozinku certifikata');
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Uvezi certifikat (.p12 / .pfx)
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* STEP 2: e-Računi API Connection */}
      <Card className={`border-none shadow-sm ${!certUploaded ? 'opacity-50 pointer-events-none' : ''}`}>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">2</span>
            e-Računi.hr API (opcionalno)
            {connected && (
              <Badge className="bg-income/10 text-income text-[8px] ml-auto gap-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" /> Povezano
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-3">
          <p className="text-[10px] text-muted-foreground">
            Opcionalno: povežite se s e-Računi.hr za automatsko slanje e-Računa i UBL dokumenata.
            Fiskalizacija radi i bez ovog koraka (koristi vaš certifikat direktno).
          </p>

          <div className="space-y-2">
            <Label className="text-xs">Korisničko ime</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder={t('placeholders.eracuniUsername')} className="h-8 text-sm" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Secret Key</Label>
            <div className="relative">
              <Input type={showSecret ? 'text' : 'password'} value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder="API secret key" className="h-8 text-sm pr-8" />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">API Token</Label>
            <div className="relative">
              <Input type={showToken ? 'text' : 'password'} value={token} onChange={e => setToken(e.target.value)} placeholder="Token organizacije" className="h-8 text-sm pr-8" />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowToken(!showToken)}>
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gap-1 text-xs h-8" onClick={testConnection} disabled={testing || !username || !secretKey || !token}>
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
              {connected ? 'Testiraj ponovo' : 'Poveži i testiraj'}
            </Button>
            {connected && (
              <Button size="sm" variant="outline" className="gap-1 text-xs h-8 text-destructive" onClick={disconnect}>
                <Unlink className="w-3 h-3" /> Odspoji
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Summary */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-3 space-y-2">
          <p className="text-xs font-semibold">Status integracije</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              {certUploaded ? <CheckCircle2 className="w-3.5 h-3.5 text-income" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className={certUploaded ? 'text-foreground' : 'text-muted-foreground'}>Fina certifikat</span>
              <Badge variant={certUploaded ? 'default' : 'outline'} className="text-[8px] ml-auto">
                {certUploaded ? 'Uvezen' : 'Potreban'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {fiscalizationEnabled ? <CheckCircle2 className="w-3.5 h-3.5 text-income" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className={fiscalizationEnabled ? 'text-foreground' : 'text-muted-foreground'}>Fiskalizacija</span>
              <Badge variant={fiscalizationEnabled ? 'default' : 'outline'} className="text-[8px] ml-auto">
                {fiscalizationEnabled ? 'Aktivna' : 'Neaktivna'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {connected ? <CheckCircle2 className="w-3.5 h-3.5 text-income" /> : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className={connected ? 'text-foreground' : 'text-muted-foreground'}>e-Računi.hr API</span>
              <Badge variant={connected ? 'default' : 'outline'} className="text-[8px] ml-auto">
                {connected ? 'Povezano' : 'Opcionalno'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help */}
      <Card className="border-none shadow-sm">
        <CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">
            <strong>ℹ️ Postupak postavljanja:</strong><br />
            1. Nabavite Fina certifikat na <a href="https://www.fina.hr" target="_blank" rel="noopener noreferrer" className="text-primary underline">fina.hr</a> (~250€/god)<br />
            2. Unesite lozinku i uvezite .p12/.pfx datoteku gore<br />
            3. (Opcionalno) Povežite e-Računi.hr za slanje e-Računa<br />
            4. Otvorite Fakturiranje → kreirajte račun → "Fiskaliziraj"
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
