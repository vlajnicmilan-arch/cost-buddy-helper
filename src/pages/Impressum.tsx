import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * Impressum / Anbieterkennzeichnung
 * Required by §5 TMG (Germany), §5 ECG & §25 MedienG (Austria).
 * Publicly accessible at /impressum so DE/AT visitors and search engines
 * can always reach it.
 */
const Impressum = () => {
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
          Zurück
        </Button>

        <h1 className="text-3xl font-bold text-foreground mb-2">Impressum</h1>
        <p className="text-muted-foreground mb-8 text-sm">
          Angaben gemäß §5 TMG (Deutschland) bzw. §5 ECG und §25 MedienG (Österreich).
        </p>

        <div className="space-y-8 text-foreground">
          {/* Anbieter */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Anbieter / Diensteanbieter</h2>
            <div className="p-4 bg-muted rounded-lg space-y-1">
              <p className="font-medium">Tactura j.d.o.o.</p>
              <p className="text-muted-foreground">Ivana Gundulića 78</p>
              <p className="text-muted-foreground">31000 Osijek</p>
              <p className="text-muted-foreground">Republik Kroatien / Republic of Croatia</p>
            </div>
          </section>

          {/* Kontakt */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Kontakt</h2>
            <div className="p-4 bg-muted rounded-lg space-y-1">
              <p className="text-muted-foreground">
                E-Mail:{' '}
                <a href="mailto:tactura.hr@gmail.com" className="text-primary hover:underline">
                  tactura.hr@gmail.com
                </a>
              </p>
              <p className="text-muted-foreground">
                Web:{' '}
                <a href="https://vmbalance.com" className="text-primary hover:underline">
                  vmbalance.com
                </a>
              </p>
            </div>
          </section>

          {/* Vertretungsberechtigt */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Vertretungsberechtigter</h2>
            <p className="text-muted-foreground">Milan Vlajnić, Direktor / Geschäftsführer</p>
          </section>

          {/* Registereintrag */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Registereintrag</h2>
            <div className="space-y-1 text-muted-foreground">
              <p>Registergericht: Trgovački sud u Osijeku (Handelsgericht Osijek)</p>
              <p>Registernummer (Tt): Tt-25/9529-2</p>
              <p>Matični broj (MB): 030305013</p>
              <p>OIB (Steuernummer Kroatien): 33941873288</p>
              <p>Rechtsform: j.d.o.o. (vereinfachte Gesellschaft mit beschränkter Haftung nach kroatischem Recht)</p>
              <p>Stammkapital: 1,33 EUR</p>
            </div>
          </section>

          {/* Verantwortlich für den Inhalt */}
          <section>
            <h2 className="text-xl font-semibold mb-3">
              Verantwortlich für den Inhalt nach §55 Abs. 2 RStV
            </h2>
            <div className="text-muted-foreground space-y-1">
              <p>Milan Vlajnić</p>
              <p>Tactura j.d.o.o.</p>
              <p>Ivana Gundulića 78, 31000 Osijek, Kroatien</p>
            </div>
          </section>

          {/* EU-Streitschlichtung */}
          <section>
            <h2 className="text-xl font-semibold mb-3">EU-Streitschlichtung</h2>
            <p className="text-muted-foreground leading-relaxed">
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
              <a
                href="https://ec.europa.eu/consumers/odr/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                https://ec.europa.eu/consumers/odr/
              </a>
              . Unsere E-Mail-Adresse finden Sie oben im Impressum.
            </p>
          </section>

          {/* Verbraucherstreitbeilegung */}
          <section>
            <h2 className="text-xl font-semibold mb-3">
              Verbraucherstreitbeilegung / Universalschlichtungsstelle
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
              Verbraucherschlichtungsstelle teilzunehmen.
            </p>
          </section>

          {/* Haftung für Inhalte */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Haftung für Inhalte</h2>
            <p className="text-muted-foreground leading-relaxed">
              Als Diensteanbieter sind wir gemäß §7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten
              nach den allgemeinen Gesetzen verantwortlich. Nach §§8 bis 10 TMG sind wir als
              Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
              Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige
              Tätigkeit hinweisen.
            </p>
          </section>

          {/* Haftung für Links */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Haftung für Links</h2>
            <p className="text-muted-foreground leading-relaxed">
              Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
              Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr
              übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
              Betreiber der Seiten verantwortlich.
            </p>
          </section>

          {/* Urheberrecht */}
          <section>
            <h2 className="text-xl font-semibold mb-3">Urheberrecht</h2>
            <p className="text-muted-foreground leading-relaxed">
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
              dem kroatischen und europäischen Urheberrecht. Die Vervielfältigung, Bearbeitung,
              Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen
              der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Impressum;
