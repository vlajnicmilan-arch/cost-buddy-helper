import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, MailX, CheckCircle2, AlertTriangle } from 'lucide-react';

type Status = 'loading' | 'valid' | 'already' | 'invalid' | 'confirming' | 'done' | 'error';

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    const validate = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const data = await res.json();
        if (data.valid === false && data.reason === 'already_unsubscribed') {
          setStatus('already');
        } else if (data.valid) {
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      } catch {
        setStatus('invalid');
      }
    };

    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setStatus('confirming');
    try {
      const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) {
        setStatus('done');
      } else if (data?.reason === 'already_unsubscribed') {
        setStatus('already');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-6">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Provjera...</p>
          </>
        )}

        {status === 'valid' && (
          <>
            <MailX className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Odjava s email obavijesti</h1>
            <p className="text-muted-foreground">
              Klikom na gumb ispod više nećete primati email obavijesti iz Centar aplikacije.
            </p>
            <Button onClick={handleUnsubscribe} className="w-full">
              Potvrdi odjavu
            </Button>
          </>
        )}

        {status === 'confirming' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Obrada...</p>
          </>
        )}

        {status === 'done' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Uspješno odjavljen/a!</h1>
            <p className="text-muted-foreground">
              Više nećete primati email obavijesti iz Centar.
            </p>
          </>
        )}

        {status === 'already' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Već ste odjavljeni</h1>
            <p className="text-muted-foreground">
              Vaša email adresa je već odjavljena s obavijesti.
            </p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Nevažeći link</h1>
            <p className="text-muted-foreground">
              Ovaj link za odjavu je nevažeći ili je istekao.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-foreground">Greška</h1>
            <p className="text-muted-foreground">
              Došlo je do greške prilikom obrade. Pokušajte ponovo kasnije.
            </p>
          </>
        )}
      </Card>
    </div>
  );
};

export default Unsubscribe;
