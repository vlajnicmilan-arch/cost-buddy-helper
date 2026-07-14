import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const TermsOfService = () => {
  const { t } = useTranslation();
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
          {t('tos.back')}
        </Button>

        <h1 className="text-3xl font-bold text-foreground mb-2">{t('tos.title')}</h1>
        <p className="text-muted-foreground mb-8">{t('tos.lastUpdated')}</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s1.title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('tos.s1.p1')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s2.title')}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{t('tos.s2.p1')}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>{t('tos.s2.l1')}</li>
              <li>{t('tos.s2.l2')}</li>
              <li>{t('tos.s2.l3')}</li>
              <li>{t('tos.s2.l4')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s3.title')}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{t('tos.s3.p1')}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><strong>Free</strong> — {t('tos.s3.free')}</li>
              <li><strong>Pro (4,99 €/mj)</strong> — {t('tos.s3.pro')}</li>
              <li><strong>Business (9,99 €/mj)</strong> — {t('tos.s3.business')}</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">{t('tos.s3.p2')}</p>
            <p className="text-muted-foreground leading-relaxed mt-2">{t('tos.s3.p3')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s4.title')}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{t('tos.s4.p1')}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>{t('tos.s4.l1')}</li>
              <li>{t('tos.s4.l2')}</li>
              <li>{t('tos.s4.l3')}</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">{t('tos.s4.p2')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s5.title')}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{t('tos.s5.p1')}</p>
            <p className="text-muted-foreground leading-relaxed">{t('tos.s5.p2')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s6.title')}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{t('tos.s6.p1')}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><strong>{t('tos.s6.access')}</strong> — {t('tos.s6.accessDesc')}</li>
              <li><strong>{t('tos.s6.rectification')}</strong> — {t('tos.s6.rectificationDesc')}</li>
              <li><strong>{t('tos.s6.erasure')}</strong> — {t('tos.s6.erasureDesc')}</li>
              <li><strong>{t('tos.s6.portability')}</strong> — {t('tos.s6.portabilityDesc')}</li>
              <li><strong>{t('tos.s6.objection')}</strong> — {t('tos.s6.objectionDesc')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s7.title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('tos.s7.p1')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s8.title')}</h2>
            <p className="text-muted-foreground leading-relaxed">{t('tos.s8.p1')}</p>
            <div className="mt-3 p-4 bg-muted rounded-lg">
              <p className="font-medium">Centar</p>
              <p className="text-muted-foreground">Email: legal@vmbalance.app</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t('tos.s9.title')}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{t('tos.s9.p1')}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>{t('tos.s9.l1')}</li>
              <li>{t('tos.s9.l2')}</li>
              <li>{t('tos.s9.l3')}</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3 font-medium text-foreground">
              {t('tos.s9.p2')}
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>© 2026 Centar. {t('tos.allRightsReserved')}</p>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
