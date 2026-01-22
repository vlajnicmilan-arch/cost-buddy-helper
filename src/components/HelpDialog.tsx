import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  HelpCircle, 
  PlusCircle, 
  ArrowRightLeft, 
  Receipt, 
  FileText, 
  PieChart, 
  Download, 
  Smartphone,
  Wallet,
  Tag,
  TrendingUp
} from "lucide-react";

const HelpDialog = () => {
  const [open, setOpen] = useState(false);

  const sections = [
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
    },
    {
      icon: Download,
      title: "Backup i obnova",
      content: [
        "Redovito radite backup podataka",
        "U lokalnom načinu rada, podaci se čuvaju na vašem uređaju",
        "U cloud načinu, podaci su automatski sinkronizirani"
      ]
    },
    {
      icon: Smartphone,
      title: "Instalacija na mobitel",
      content: [
        "Aplikaciju možete instalirati kao mobilnu aplikaciju",
        "Android: Menu (⋮) → 'Instaliraj aplikaciju'",
        "iPhone: Share (⬆) → 'Dodaj na početni zaslon'",
        "Posjetite /install stranicu za detaljne upute"
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Upute za korištenje">
          <HelpCircle className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <HelpCircle className="w-6 h-6 text-primary" />
            Upute za korištenje
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[65vh] pr-4">
          <div className="space-y-6">
            <p className="text-muted-foreground">
              V&M Balance je aplikacija za praćenje osobnih financija. 
              Evo kako ju koristiti:
            </p>
            
            {sections.map((section, index) => (
              <div 
                key={index} 
                className="bg-muted/50 rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-full bg-primary/10">
                    <section.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">{section.title}</h3>
                </div>
                <ul className="space-y-1 ml-11">
                  {section.content.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            
            <div className="bg-primary/10 rounded-lg p-4 mt-6">
              <h3 className="font-semibold mb-2">💡 Savjet</h3>
              <p className="text-sm text-muted-foreground">
                Za najbolje iskustvo, redovito unosite transakcije i kategorizirajte ih. 
                Tako ćete imati jasniji uvid u svoje financije i moći donositi bolje odluke.
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
