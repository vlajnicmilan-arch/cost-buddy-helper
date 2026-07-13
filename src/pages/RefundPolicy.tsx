import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const RefundPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Natrag
        </Button>

        <h1 className="text-3xl font-bold text-foreground mb-2">
          Politika povrata novca / Refund Policy
        </h1>
        <p className="text-muted-foreground mb-8">Verzija 1.0 — 13. srpnja 2026.</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">Hrvatski</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                Za prvu kupnju bilo koje pretplate vrijedi povrat novca u roku od{' '}
                <strong>14 dana bez pitanja</strong> — javite se na{' '}
                <a href="mailto:support@vmbalance.com" className="text-primary hover:underline">
                  support@vmbalance.com
                </a>{' '}
                ili zatražite povrat kroz Paddle (naš obrađivač plaćanja i merchant of record,
                koji provodi povrate).
              </p>
              <p>
                Pretplatu možete otkazati bilo kada; otkaz vrijedi od kraja tekućeg obračunskog
                razdoblja, a već plaćeno razdoblje ostaje aktivno do isteka.
              </p>
              <p>
                Za obnove pretplate povrat se odobrava za neiskorišteno razdoblje ako zahtjev
                stigne u roku od 14 dana od naplate.
              </p>
              <p>
                Početkom korištenja pretplate pristajete na trenutno pružanje digitalne usluge;
                time se zakonsko pravo na odustajanje ostvaruje kroz gore opisane uvjete povrata.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">English</h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                First purchase of any subscription comes with a{' '}
                <strong>14-day no-questions money-back guarantee</strong> — contact{' '}
                <a href="mailto:support@vmbalance.com" className="text-primary hover:underline">
                  support@vmbalance.com
                </a>{' '}
                or request a refund via Paddle (our payment processor and merchant of record,
                which processes refunds).
              </p>
              <p>
                You can cancel your subscription at any time; cancellation takes effect at the
                end of the current billing period, and the period already paid remains active
                until it expires.
              </p>
              <p>
                For renewals, a refund is available for the unused period if requested within 14
                days of the charge.
              </p>
              <p>
                By starting your subscription you consent to immediate performance of the digital
                service; the statutory right of withdrawal is honoured through the refund terms
                above.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RefundPolicy;
